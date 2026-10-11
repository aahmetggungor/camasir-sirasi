from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from streamlit.testing.v1 import AppTest

from apps.streamlit.client import LaundryClient, machine_code, error_message
from apps.streamlit.web import countdown, my_right

ROOT = Path(__file__).resolve().parents[3]


def fixture(role='owner', status='active', uid='user-a'):
    end = (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()
    return {'profile': {'id': uid, 'name': 'Test Kullanıcı', 'email': 'example@example.invalid'},
            'spaces': [{'id': 'space-a', 'name': 'Test Alanı', 'role': role, 'membershipStatus': status,
                        'kind': 'Yurt', 'timezone': 'Europe/Istanbul', 'rules': {
                            'openHour': 0, 'closeHour': 24, 'peakStartHour': 18, 'peakEndHour': 23,
                            'dailyLimit': 2, 'peakDailyLimit': 1, 'startGraceMinutes': 5,
                            'pickupMinutes': 5, 'offerMinutes': 3, 'arrivalMinutes': 5}}],
            'machines': [{'id': 'washer-a', 'spaceId': 'space-a', 'name': 'Çamaşır 01', 'type': 'washer',
                          'status': 'available', 'qrToken': '' if role == 'member' else 'washer-code-1234', 'estimatedEndAt': None},
                         {'id': 'dryer-a', 'spaceId': 'space-a', 'name': 'Kurutma 01', 'type': 'dryer',
                          'status': 'running', 'qrToken': '' if role == 'member' else 'dryer-code-1234', 'estimatedEndAt': end}],
            'programs': [{'id': 'program-a', 'machineId': 'dryer-a', 'name': 'Hızlı kurutma', 'durationMinutes': 30},
                         {'id': 'program-b', 'machineId': 'washer-a', 'name': 'Hızlı yıkama', 'durationMinutes': 30}],
            'memberships': [], 'reservations': [], 'waitlist': [], 'offers': [], 'notifications': [], 'watches': []}


class FakeClient:
    def __init__(self, data):
        self.data = data
        self.calls = []
        self.signed_out = False

    def authenticated(self):
        return not self.signed_out

    def snapshot(self):
        return deepcopy(self.data)

    def sign_out(self):
        self.signed_out = True

    def command(self, action, **payload):
        self.calls.append((action, payload))
        if action == 'resolveMachine':
            return {'spaceId': 'space-a', 'machineId': 'dryer-a'}
        if action == 'getAvailability':
            start = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
            return [{'startsAt': start, 'endsAt': start, 'available': True}]
        if action == 'startWalkIn':
            return 'reservation-a'


def app(data=None):
    at = AppTest.from_file(str(ROOT / 'streamlit_app.py'), default_timeout=15)
    at.secrets['SUPABASE_URL'] = 'https://example.supabase.co'
    at.secrets['SUPABASE_PUBLISHABLE_KEY'] = 'sb_publishable_test-only'
    at.session_state['_client'] = FakeClient(data or fixture())
    return at.run()


def button(at, label):
    return next(b for b in at.button if b.label == label)


class StreamlitRegressionTests(unittest.TestCase):
    def test_types_stay_separate(self):
        at = app()
        self.assertEqual(len(at.exception), 0)
        cards = '\n'.join(m.value for m in at.markdown)
        self.assertIn('Çamaşır 01', cards)
        self.assertNotIn('Kurutma 01', cards)
        at.sidebar.radio[0].set_value('Kurutma').run()
        self.assertEqual(len(at.exception), 0)
        cards = '\n'.join(m.value for m in at.markdown)
        self.assertIn('Kurutma 01', cards)
        self.assertNotIn('Çamaşır 01', cards)

    def test_pending_member_cannot_see_machine_cards(self):
        at = app(fixture(role='member', status='pending'))
        self.assertEqual(len(at.exception), 0)
        self.assertFalse(any('<div class="machine-title"' in m.value for m in at.markdown))
        self.assertFalse(any(b.label == 'QR / ayarlar' for b in at.button))

    def test_regular_member_has_no_admin_controls(self):
        at = app(fixture(role='member'))
        self.assertFalse(any(b.label in ('QR / ayarlar', 'Makine ekle') for b in at.button))
        at.sidebar.radio[0].set_value('Alan').run()
        self.assertEqual(len(at.exception), 0)
        self.assertFalse(any(b.label == 'Davet kodu oluştur' for b in at.button))

    def test_single_right_applies_to_dryer_too(self):
        data = fixture()
        data['reservations'] = [{'spaceId': 'space-a', 'userId': 'user-a', 'status': 'running'}]
        self.assertTrue(my_right(data, 'space-a'))
        at = app(data)
        at.sidebar.radio[0].set_value('Kurutma').run()
        self.assertTrue(button(at, 'Rezervasyon / sıra').disabled)

    def test_qr_resolution_requires_explicit_physical_confirmation(self):
        at = app()
        fake = at.session_state['_client']
        button(at, 'QR / makine kodu').click().run()
        next(t for t in at.text_input if t.label == 'Makine kodu / QR bağlantısı').set_value('camasirsirasi://machine?code=dryer-code-1234')
        button(at, 'Makineyi bul').click().run()
        self.assertEqual(len(at.exception), 0)
        self.assertTrue(button(at, 'Kullanımı başlat').disabled)
        self.assertEqual(fake.calls[0], ('resolveMachine', {'machineQr': 'dryer-code-1234'}))
        self.assertFalse(any(c[0] == 'startWalkIn' for c in fake.calls))
        at.checkbox[0].check().run()
        button(at, 'Kullanımı başlat').click().run()
        self.assertEqual(len(at.exception), 0)
        self.assertIn(('startWalkIn', {'machineQr': 'dryer-code-1234', 'programId': 'program-a'}), fake.calls)
        self.assertEqual(at.sidebar.radio[0].value, 'Kurutma')

    def test_browser_sessions_and_logout_are_isolated(self):
        first, second = app(), app(fixture(uid='user-b'))
        client_a, client_b = first.session_state['_client'], second.session_state['_client']
        self.assertIsNot(client_a, client_b)
        button(first, 'Çıkış yap').click().run()
        self.assertEqual(len(first.exception), 0)
        self.assertTrue(client_a.signed_out)
        self.assertFalse(client_b.signed_out)
        self.assertEqual(second.session_state['_client'].snapshot()['profile']['id'], 'user-b')
        self.assertTrue(any(t.label == 'Parola' for t in first.text_input))

    def test_unsafe_keys_and_wrong_qr_domains_are_rejected(self):
        for value in ['https://evil.invalid/?code=dryer-code-1234', 'camasirsirasi://invite?code=dryer-code-1234', '']:
            self.assertEqual(machine_code(value), '')
        with self.assertRaises(ValueError):
            LaundryClient('https://example.supabase.co', 'sb_secret_should-not-be-used')
        self.assertNotIn('private-secret', error_message(RuntimeError('private-secret')))

    def test_expiring_session_refreshes_before_guarded_rpc(self):
        api = SimpleNamespace(auth=SimpleNamespace(get_session=lambda: SimpleNamespace(expires_at=1), refresh_session=lambda: None))
        with patch('apps.streamlit.client.create_client', return_value=api):
            instance = LaundryClient('https://example.supabase.co', 'sb_publishable_test-only')
            with patch.object(api.auth, 'refresh_session') as refresh:
                self.assertTrue(instance.authenticated())
                refresh.assert_called_once()

    def test_countdown_uses_timestamp_and_waits_for_pickup(self):
        now = datetime(2026, 10, 11, tzinfo=timezone.utc)
        self.assertEqual(countdown((now + timedelta(seconds=90)).isoformat(), now), '01:30')
        self.assertIn('teslim bekleniyor', countdown((now - timedelta(seconds=1)).isoformat(), now))


if __name__ == '__main__':
    unittest.main()

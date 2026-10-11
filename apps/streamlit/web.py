from __future__ import annotations

from datetime import datetime, timedelta, timezone
from html import escape
from io import BytesIO
import math
import os
from urllib.parse import quote
from zoneinfo import ZoneInfo

import qrcode
import streamlit as st

from .client import LaundryClient, error_message, machine_code

STATUS = {'available': 'Kullanıma hazır', 'running': 'Kullanım sürüyor',
          'awaiting_pickup': 'Teslim bekleniyor', 'out_of_order': 'Bakımda',
          'needs_check': 'Kontrol gerekli', 'confirmed': 'Onaylı rezervasyon',
          'offered': 'Teklif bekleniyor', 'completed': 'Tamamlandı',
          'cancelled': 'İptal edildi', 'no_show': 'Gelinmedi', 'pending': 'Onay bekliyor',
          'active': 'Aktif', 'blocked': 'Engelli', 'rejected': 'Reddedildi', 'removed': 'Ayrıldı'}


def parse_time(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00')) if value else None


def clock(value, space):
    dt = parse_time(value)
    return dt.astimezone(ZoneInfo(space['timezone'])).strftime('%d.%m · %H:%M') if dt else '—'


def countdown(value, now=None):
    dt = parse_time(value)
    if not dt:
        return 'Süre bilgisi yok'
    seconds = max(0, math.ceil((dt - (now or datetime.now(timezone.utc))).total_seconds()))
    if not seconds:
        return 'Süre doldu · teslim bekleniyor'
    hours, left = divmod(seconds, 3600)
    minutes, secs = divmod(left, 60)
    return f'{hours}:{minutes:02}:{secs:02}' if hours else f'{minutes:02}:{secs:02}'


def my_right(snapshot, space_id):
    uid = snapshot['profile']['id']
    return any(r['spaceId'] == space_id and r['userId'] == uid and r['status'] in
               ('confirmed', 'running', 'offered') for r in snapshot['reservations']) or any(
        w['spaceId'] == space_id and w['userId'] == uid and w['status'] in ('waiting', 'offered')
        for w in snapshot['waitlist'])


def programs(snapshot, machine_id):
    return [p for p in snapshot['programs'] if p['machineId'] == machine_id]


def program_label(p):
    return f"{p['name']} · {p['durationMinutes']} dk"


def machine_label(machine):
    return ('Kurutma' if machine.get('type') == 'dryer' else 'Çamaşır') + ' · ' + machine['name']


def client():
    return st.session_state['_client']


def perform(action, **payload):
    try:
        result = client().command(action, **payload)
        st.session_state['_flash'] = 'İşlem tamamlandı.'
        return True, result
    except Exception as exc:
        st.error(error_message(exc))
        return False, None


def submit(action, **payload):
    ok, _ = perform(action, **payload)
    if ok:
        st.session_state.pop('_dialog', None)
        st.rerun()


def dismiss_dialog():
    st.session_state.pop('_dialog', None)


def open_dialog(kind, **values):
    st.session_state['_dialog'] = {'kind': kind, **values}
    st.rerun()


@st.dialog('Alan oluştur veya katıl', on_dismiss=dismiss_dialog)
def area_dialog():
    mode = st.radio('İşlem', ['Alana katıl', 'Yeni alan oluştur'], horizontal=True)
    with st.form('area_form', clear_on_submit=True):
        if mode == 'Alana katıl':
            code = st.text_input('Davet kodu')
            room = st.text_input('Oda / birim', help='Yöneticinin seni tanıması için.')
            send = st.form_submit_button('Katılma isteği gönder', type='primary')
            if send:
                if not code.strip():
                    st.error('Davet kodunu gir.')
                else:
                    submit('requestMembership', code=code.strip(), room=room.strip())
        else:
            name = st.text_input('Alan adı')
            kind = st.selectbox('Mekân', ['Yurt', 'Apartman', 'Site', 'İş yeri', 'Diğer'])
            if st.form_submit_button('Alan oluştur', type='primary'):
                if name.strip():
                    ok, sid = perform('createSpace', name=name.strip(), kind=kind)
                    if ok:
                        st.session_state['_selected_space'] = sid
                        dismiss_dialog()
                        st.rerun()
                else:
                    st.error('Alan adını gir.')


@st.dialog('QR / makine kodu', on_dismiss=dismiss_dialog)
def scan_dialog():
    st.caption('Etiketteki kodu veya QR bağlantısını gir. Kamerayla okutmak için mobil uygulamayı kullan.')
    with st.form('find_machine'):
        raw = st.text_input('Makine kodu / QR bağlantısı')
        if st.form_submit_button('Makineyi bul', type='primary'):
            code = machine_code(raw)
            if not code:
                st.error('Geçerli bir makine kodu gir.')
            else:
                ok, found = perform('resolveMachine', machineQr=code)
                if ok:
                    st.session_state['_resolved_machine'] = {**found, 'code': code}
    found = st.session_state.get('_resolved_machine')
    if not found:
        return
    try:
        snapshot = client().snapshot()
        machine = next((m for m in snapshot['machines'] if m['id'] == found['machineId']), None)
        if not machine:
            st.session_state.pop('_resolved_machine', None)
            st.warning('Bu makineye erişimin yok.')
            return
        choices = programs(snapshot, machine['id'])
        st.subheader(machine_label(machine))
        if not choices:
            st.info('Yönetici henüz program eklememiş.')
            return
        p = st.selectbox('Program', choices, format_func=program_label, key='qr_program')
        finish = datetime.now(timezone.utc) + timedelta(minutes=p['durationMinutes'])
        space = next(s for s in snapshot['spaces'] if s['id'] == found['spaceId'])
        st.caption('Tahmini bitiş: ' + clock(finish.isoformat(), space))
        physical = st.checkbox('Makine boştu; çamaşırlarımı koydum ve seçtiğim programı makine panelinden başlattım.')
        if st.button('Kullanımı başlat', type='primary', disabled=not physical):
            ok, _ = perform('startWalkIn', machineQr=found['code'], programId=p['id'])
            if ok:
                st.session_state['_selected_space'] = space['id']
                st.session_state['_next_page'] = 'Kurutma' if machine.get('type') == 'dryer' else 'Çamaşır'
                st.session_state.pop('_resolved_machine', None)
                dismiss_dialog()
                st.rerun()
    except Exception as exc:
        st.error(error_message(exc))


@st.dialog('Makine ekle', on_dismiss=dismiss_dialog)
def add_machine_dialog(space, machine_type):
    label = 'Kurutma' if machine_type == 'dryer' else 'Çamaşır'
    st.caption(label + ' makinesi')
    with st.form('add_machine', clear_on_submit=True):
        name = st.text_input('Makine adı', placeholder=label + ' 01')
        defaults = ('Hızlı kurutma', 'Dolap kuruluğu') if machine_type == 'dryer' else ('Hızlı yıkama', 'Standart yıkama')
        pn1 = st.text_input('1. program', value=defaults[0])
        pd1 = st.number_input('1. program süresi (dk)', min_value=10, max_value=240, value=30)
        pn2 = st.text_input('2. program', value=defaults[1])
        pd2 = st.number_input('2. program süresi (dk)', min_value=10, max_value=240, value=60)
        if st.form_submit_button(label + ' makinesi ekle', type='primary'):
            submit('addMachine', spaceId=space['id'], name=name.strip(), machineType=machine_type,
                   programs=[{'name': pn1.strip(), 'durationMinutes': pd1}, {'name': pn2.strip(), 'durationMinutes': pd2}])


@st.dialog('Makine ayarları', on_dismiss=dismiss_dialog)
def machine_settings_dialog(machine, snapshot):
    st.subheader(machine_label(machine))
    token = machine.get('qrToken')
    if token:
        buf = BytesIO()
        qrcode.make('camasirsirasi://machine?code=' + quote(token)).save(buf, format='PNG')
        st.image(buf.getvalue(), width=220)
        st.code(token, language=None)
        st.download_button('QR etiketini indir', buf.getvalue(), file_name='makine-qr.png', mime='image/png')
    st.caption('Kayıtlı programlar')
    for p in programs(snapshot, machine['id']):
        st.write(program_label(p))
    with st.form('add_program', clear_on_submit=True):
        name = st.text_input('Yeni program adı')
        duration = st.number_input('Süre (dk)', min_value=10, max_value=240, value=30)
        if st.form_submit_button('Program ekle'):
            submit('addProgram', machineId=machine['id'], name=name.strip(), durationMinutes=duration)
    status = 'available' if machine['status'] in ('out_of_order', 'needs_check') else 'out_of_order'
    confirm = st.checkbox('Makinenin fiziksel durumunu kontrol ettim.')
    if st.button('Kullanıma aç' if status == 'available' else 'Bakıma al', disabled=not confirm):
        submit('setMachineStatus', machineId=machine['id'], status=status)


@st.dialog('Rezervasyon / sıra', on_dismiss=dismiss_dialog)
def booking_dialog(machine, space, snapshot):
    st.subheader(machine_label(machine))
    choices = programs(snapshot, machine['id'])
    if not choices:
        st.info('Bu makine için program yok.')
        return
    p = st.selectbox('Program', choices, format_func=program_label)
    mode = st.radio('İşlem', ['Saat seç', 'Sıra iste'], horizontal=True)
    if mode == 'Saat seç':
        today = datetime.now(ZoneInfo(space['timezone'])).date()
        day = st.date_input('Gün', value=today, min_value=today, max_value=today + timedelta(days=7))
        try:
            slots = client().command('getAvailability', machineId=machine['id'], programId=p['id'], day=day.isoformat())
        except Exception as exc:
            st.error(error_message(exc))
            return
        available = [s for s in slots if s['available']]
        if not available:
            st.info('Bu gün uygun saat yok. Başka gün seçebilir veya sıra isteyebilirsin.')
        else:
            slot = st.selectbox('Başlangıç', available, format_func=lambda x: clock(x['startsAt'], space))
            if st.button('Rezervasyon yap', type='primary', disabled=my_right(snapshot, space['id'])):
                submit('reserve', machineId=machine['id'], programId=p['id'], startsAt=slot['startsAt'])
    else:
        hours = st.selectbox('Ne kadar süre içinde gelebilirsin?', [1, 2, 4, 8], format_func=lambda x: f'{x} saat')
        st.caption('Makine boşalınca süreli teklif gelir. Teklifi kabul etmen gerekir.')
        if st.button('Sıraya katıl', type='primary', disabled=my_right(snapshot, space['id'])):
            submit('joinWaitlist', spaceId=space['id'], programId=p['id'], availableUntil=(datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat())


@st.fragment(run_every=1)
def active_countdowns(machines):
    occupied = [m for m in machines if m['status'] in ('running', 'awaiting_pickup')]
    now = datetime.now(timezone.utc)
    occupied.sort(key=lambda m: (-max(0, ((parse_time(m['estimatedEndAt']) or now) - now).total_seconds()), m['name']))
    for m in occupied:
        color = '#b77918' if m.get('type') == 'dryer' else '#2563eb'
        st.markdown(f'<div class="active-row"><span>{escape(m["name"])}</span><strong style="color:{color}">{escape(countdown(m["estimatedEndAt"]))}</strong></div>', unsafe_allow_html=True)


def machines_page(snapshot, space, machine_type):
    title = 'Kurutma' if machine_type == 'dryer' else 'Çamaşır'
    machines = [m for m in snapshot['machines'] if m['spaceId'] == space['id'] and m.get('type', 'washer') == machine_type]
    st.header(title + ' makineleri')
    owner = space['role'] in ('owner', 'admin')
    left, right = st.columns([3, 1])
    left.caption('Programını seç; sıranı ve kalan süreyi buradan takip et.')
    if owner and right.button('Makine ekle', key='add_' + machine_type):
        open_dialog('add', space_id=space['id'], machine_type=machine_type)
    counts = st.columns(3)
    counts[0].metric('Toplam', len(machines))
    counts[1].metric('Boş', sum(m['status'] == 'available' for m in machines))
    counts[2].metric('Kullanımda', sum(m['status'] in ('running', 'awaiting_pickup') for m in machines))
    if any(m['status'] in ('running', 'awaiting_pickup') for m in machines):
        st.subheader('Aktif kurutmalar' if machine_type == 'dryer' else 'Aktif yıkamalar')
        active_countdowns(machines)
    has_right = my_right(snapshot, space['id'])
    if has_right:
        st.info('Bu alanda aktif bir hakkın var. Çamaşır ve kurutma için tek hak ortak; işlemini Sıram ekranından yönet.')
    if not machines:
        st.info('Henüz ' + title.lower() + ' makinesi eklenmemiş.')
    for m in machines:
        with st.container(border=True):
            color = '#b77918' if machine_type == 'dryer' else '#2563eb'
            st.markdown(f'<div class="machine-title"><strong>{escape(m["name"])}</strong><span style="color:{color}">{title}</span></div>', unsafe_allow_html=True)
            st.caption(STATUS.get(m['status'], m['status']))
            buttons = st.columns(3)
            busy = m['status'] in ('running', 'awaiting_pickup')
            service = m['status'] in ('out_of_order', 'needs_check')
            if buttons[0].button('Rezervasyon / sıra', key='book_' + m['id'], disabled=has_right or service):
                open_dialog('book', machine_id=m['id'], space_id=space['id'])
            watches = snapshot.get('watches', [])
            watched = any(w['machineId'] == m['id'] for w in watches)
            if busy and buttons[1].button('Takibi bırak' if watched else 'Boşalınca haber ver', key='watch_' + m['id']):
                submit('watchMachine', machineId=m['id'], enabled=not watched)
            if owner and buttons[2].button('QR / ayarlar', key='settings_' + m['id']):
                open_dialog('settings', machine_id=m['id'], space_id=space['id'])


def queue_page(snapshot, space):
    st.header('Sıram')
    uid = snapshot['profile']['id']
    own = [r for r in snapshot['reservations'] if r['spaceId'] == space['id'] and r['userId'] == uid and r['status'] in ('running', 'confirmed', 'offered')]
    for offer in snapshot['offers']:
        if offer['spaceId'] == space['id'] and offer['userId'] == uid and offer['status'] == 'pending':
            with st.container(border=True):
                st.subheader('Bir makine için yer açıldı')
                st.caption('Teklif bitişi: ' + clock(offer['expiresAt'], space))
                a, b = st.columns(2)
                if a.button('Kabul et', key='accept_' + offer['id'], type='primary'):
                    submit('acceptOffer', offerId=offer['id'])
                if b.button('Vazgeç', key='decline_' + offer['id']):
                    submit('declineOffer', offerId=offer['id'])
    waiting = [w for w in snapshot['waitlist'] if w['spaceId'] == space['id'] and w['userId'] == uid and w['status'] in ('waiting', 'offered')]
    if not own and not waiting:
        st.info('Aktif kullanım, rezervasyon veya sıra isteğin yok.')
    for r in own:
        machine = next((m for m in snapshot['machines'] if m['id'] == r['machineId']), None)
        with st.container(border=True):
            st.subheader(machine_label(machine) if machine else 'Kullanım')
            st.caption(STATUS[r['status']] + ' · ' + clock(r['startsAt'], space))
            if r['status'] == 'running':
                st.write(countdown(r['estimatedEndAt']))
                taken = st.checkbox('Çamaşırlarımı aldım; makine boş.', key='pickup_' + r['id'])
                if st.button('Teslimi onayla', disabled=not taken, key='finish_' + r['id'], type='primary'):
                    submit('finishUsage', reservationId=r['id'])
            elif r['status'] == 'confirmed':
                st.caption('Makinenin yanına geldiğinde üstteki QR / kod düğmesini kullan.')
                if st.button('Rezervasyonu iptal et', key='cancel_' + r['id']):
                    submit('cancelReservation', reservationId=r['id'])
    for w in waiting:
        with st.container(border=True):
            p = next((p for p in snapshot['programs'] if p['id'] == w['programId']), None)
            m = next((m for m in snapshot['machines'] if p and m['id'] == p['machineId']), None)
            st.write('Sıra isteği · ' + (machine_label(m) if m else 'Makine'))
            st.caption('Gelebileceğin son saat: ' + clock(w['availableUntil'], space))
            if st.button('Sıradan ayrıl', key='leave_' + w['id']):
                submit('leaveWaitlist', entryId=w['id'])
    if space['role'] in ('owner', 'admin'):
        with st.expander('Alandaki kullanımlar'):
            for r in snapshot['reservations']:
                if r['spaceId'] == space['id'] and r['status'] == 'running' and r['userId'] != uid:
                    st.write(r['userName'] + ' · ' + clock(r['startedAt'], space))
                    confirmed = st.checkbox('Teslim alındı, makine boş.', key='admin_check_' + r['id'])
                    if st.button('Teslimi onayla', key='admin_finish_' + r['id'], disabled=not confirmed):
                        submit('finishUsage', reservationId=r['id'])


def area_page(snapshot, space):
    st.header('Alan yönetimi')
    st.write(space['name'])
    if space['role'] not in ('owner', 'admin'):
        st.caption('Davet ve üye işlemlerini alan yöneticisi yapar.')
        return
    if st.button('Davet kodu oluştur'):
        ok, invite = perform('createInvite', spaceId=space['id'])
        if ok:
            st.session_state['_invite'] = {'spaceId': space['id'], **invite}
    invite = st.session_state.get('_invite')
    if invite and invite['spaceId'] == space['id']:
        st.code(invite['code'], language=None)
        st.caption('Geçerlilik: ' + clock(invite['expiresAt'], space) + ' · Başvuru sonrası yönetici onayı gerekir.')
    with st.expander('Üyeler', expanded=True):
        for member in snapshot['memberships']:
            if member['spaceId'] != space['id']:
                continue
            st.write(member['name'] + ' · ' + STATUS.get(member['status'], member['status']))
            st.caption(member['email'] + (' · ' + member['room'] if member['room'] else ''))
            if member['status'] == 'pending':
                verified = st.checkbox('Bu kişinin alana katılmasına izin veriyorum.', key='verify_' + member['id'])
                a, b = st.columns(2)
                if a.button('Onayla', key='approve_' + member['id'], disabled=not verified):
                    submit('approveMember', membershipId=member['id'], verified=True)
                if b.button('Reddet', key='reject_' + member['id']):
                    submit('rejectMember', membershipId=member['id'], reason='Yönetici başvuruyu onaylamadı.')
            elif member['status'] == 'active' and member['role'] == 'member':
                confirm = st.checkbox('Bu üyenin erişimini kapat.', key='block_check_' + member['id'])
                if st.button('Erişimi kapat', key='block_' + member['id'], disabled=not confirm):
                    submit('blockMember', membershipId=member['id'])
    with st.expander('Kullanım kuralları'):
        with st.form('rules'):
            labels = [('openHour', 'Açılış saati', 0, 23), ('closeHour', 'Kapanış saati', 1, 24),
                      ('peakStartHour', 'Yoğun saat başlangıcı', 0, 23), ('peakEndHour', 'Yoğun saat bitişi', 1, 24),
                      ('dailyLimit', 'Günlük kullanım sınırı', 1, 10), ('peakDailyLimit', 'Yoğun saatte kullanım sınırı', 1, 10),
                      ('startGraceMinutes', 'Başlatma toleransı (dk)', 1, 30), ('pickupMinutes', 'Teslim toleransı (dk)', 1, 60),
                      ('offerMinutes', 'Teklif süresi (dk)', 1, 10), ('arrivalMinutes', 'Teklif sonrası geliş süresi (dk)', 1, 30)]
            rules = {key: st.number_input(label, min_value=lo, max_value=hi, value=int(space['rules'][key])) for key, label, lo, hi in labels}
            st.caption('Tek aktif hak ve günlük sınır çamaşır / kurutma için ortaktır.')
            if st.form_submit_button('Kuralları kaydet'):
                submit('saveRules', spaceId=space['id'], rules=rules)


def auth_page(site_url):
    st.title('ÇamaşırSırası')
    st.caption('Ortak çamaşırhanen; açıkça görünen sıra, kolay kullanım.')
    mode = st.radio('Hesap', ['Giriş yap', 'Kayıt ol'], horizontal=True)
    with st.form('authentication', clear_on_submit=True):
        name = st.text_input('Ad soyad') if mode == 'Kayıt ol' else ''
        email = st.text_input('E-posta')
        password = st.text_input('Parola', type='password')
        if st.form_submit_button(mode, type='primary'):
            if not email.strip() or not password or (mode == 'Kayıt ol' and (len(password) < 8 or not name.strip())):
                st.error('Alanları doldur; parolan en az 8 karakter olsun.')
            else:
                try:
                    response = client().sign_in(email, password) if mode == 'Giriş yap' else client().sign_up(name, email, password, site_url)
                    if response.session:
                        st.rerun()
                    else:
                        st.success('Doğrulama e-postası gönderilebildiyse bağlantıyı aç, ardından buradan giriş yap.')
                except Exception as exc:
                    st.error(error_message(exc))
    st.caption('Supabase panel hesabından ayrı uygulama hesabını kullan.')


@st.fragment(run_every=30)
def content(space_id, page):
    try:
        snapshot = client().snapshot()
    except Exception as exc:
        st.error(error_message(exc))
        return
    space = next((s for s in snapshot['spaces'] if s['id'] == space_id), None)
    if not space or space['membershipStatus'] != 'active':
        st.info('Bu alandaki üyeliğin onay bekliyor veya erişimin kapalı. Yöneticinle görüş.')
        return
    if page in ('Çamaşır', 'Kurutma'):
        machines_page(snapshot, space, 'dryer' if page == 'Kurutma' else 'washer')
    elif page == 'Sıram':
        queue_page(snapshot, space)
    elif page == 'Alan':
        area_page(snapshot, space)
    else:
        st.header('Bildirimler')
        for notice in snapshot['notifications']:
            with st.container(border=True):
                st.write(notice['title'])
                st.caption(notice['body'])
        if not snapshot['notifications']:
            st.info('Henüz bildirimin yok.')


def setting(name):
    try:
        return str(st.secrets.get(name, os.environ.get(name, '')))
    except FileNotFoundError:
        return os.environ.get(name, '')


def render_dialog(snapshot):
    selected = st.session_state.get('_dialog')
    if not selected:
        return
    kind = selected['kind']
    if kind == 'area':
        area_dialog()
        return
    if kind == 'scan':
        scan_dialog()
        return
    space = next((s for s in snapshot['spaces'] if s['id'] == selected.get('space_id') and s['membershipStatus'] == 'active'), None)
    if not space or (kind in ('add', 'settings') and space['role'] not in ('owner', 'admin')):
        dismiss_dialog()
        return
    if kind == 'add':
        add_machine_dialog(space, selected['machine_type'])
    else:
        machine = next((m for m in snapshot['machines'] if m['id'] == selected.get('machine_id') and m['spaceId'] == space['id']), None)
        if not machine:
            dismiss_dialog()
            return
        if kind == 'book':
            booking_dialog(machine, space, snapshot)
        elif kind == 'settings':
            machine_settings_dialog(machine, snapshot)


def main():
    st.set_page_config(page_title='ÇamaşırSırası', page_icon='🫧', layout='centered')
    st.markdown('<style>.block-container{max-width:900px;padding-top:2rem}h1,h2,h3{letter-spacing:-.02em}.active-row,.machine-title{display:flex;justify-content:space-between;gap:12px;padding:10px 0}.machine-title span{font-size:13px}.active-row{border-bottom:1px solid #eef1f5}</style>', unsafe_allow_html=True)
    url, key = setting('SUPABASE_URL'), setting('SUPABASE_PUBLISHABLE_KEY')
    if not url or not key:
        st.title('ÇamaşırSırası')
        st.info('Bağlantı ayarları henüz tamamlanmamış. Alan yöneticisine haber ver.')
        st.stop()
    if '_client' not in st.session_state:
        try:
            st.session_state['_client'] = LaundryClient(url, key)
        except Exception:
            st.error('Bağlantı ayarlarını kontrol edin.')
            st.stop()
    try:
        logged_in = client().authenticated()
    except Exception:
        st.session_state.clear()
        st.rerun()
    if not logged_in:
        auth_page(setting('SITE_URL'))
        return
    try:
        snapshot = client().snapshot()
    except Exception as exc:
        st.error(error_message(exc))
        if st.button('Giriş ekranına dön'):
            st.session_state.clear()
            st.rerun()
        return
    with st.sidebar:
        st.title('ÇamaşırSırası')
        st.caption(snapshot['profile']['name'])
        spaces = snapshot['spaces']
        if spaces:
            ids = [s['id'] for s in spaces]
            preferred = st.session_state.pop('_selected_space', st.session_state.get('_space', ids[0]))
            if preferred not in ids:
                preferred = ids[0]
            if st.session_state.get('_space') not in ids or preferred != st.session_state.get('_space'):
                st.session_state['_space'] = preferred
            space_id = st.selectbox('Alanım', ids, format_func=lambda sid: next(s['name'] for s in spaces if s['id'] == sid), key='_space')
        else:
            space_id = None
        if '_next_page' in st.session_state:
            st.session_state['_page'] = st.session_state.pop('_next_page')
        page = st.radio('Menü', ['Çamaşır', 'Kurutma', 'Sıram', 'Alan', 'Bildirimler'], key='_page')
        if st.button('Alan oluştur / katıl', use_container_width=True):
            open_dialog('area')
        if st.button('Çıkış yap', use_container_width=True):
            try:
                client().sign_out()
            except Exception:
                pass
            finally:
                st.session_state.clear()
            st.rerun()
    if st.session_state.get('_flash'):
        st.toast(st.session_state.pop('_flash'))
    if st.button('QR / makine kodu', key='scan'):
        st.session_state.pop('_resolved_machine', None)
        open_dialog('scan')
    if not space_id:
        st.header('Çamaşırhanene katıl')
        st.info('Yöneticinden davet kodu al veya kendi alanını oluştur.')
        if st.button('Alan oluştur veya katıl', type='primary'):
            open_dialog('area')
    else:
        content(space_id, page)
    render_dialog(snapshot)

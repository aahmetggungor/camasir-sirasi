"""A separate Supabase client for each browser session; never globally cached."""
from __future__ import annotations

import time
from urllib.parse import parse_qs, urlparse
import re

from supabase import ClientOptions, create_client


def machine_code(value: str) -> str:
    raw = value.strip()
    if '://' in raw:
        parsed = urlparse(raw)
        if parsed.scheme != 'camasirsirasi' or parsed.netloc != 'machine':
            return ''
        raw = parse_qs(parsed.query).get('code', [''])[0].strip()
    return raw if re.fullmatch(r'[a-zA-Z0-9-]{8,128}', raw) else ''


def error_message(exc: Exception) -> str:
    message = getattr(exc, 'message', '')
    friendly = {
        'Invalid login credentials': 'E-posta veya parola yanlış.',
        'Email not confirmed': 'Giriş yapmadan önce e-postanı doğrula.',
        'User already registered': 'Bu e-posta için zaten bir hesap var.',
        'Email rate limit exceeded': 'E-posta gönderim sınırına ulaşıldı. Biraz sonra tekrar dene.',
    }
    if message in friendly:
        return friendly[message]
    # Database business errors contain the existing Turkish instructions, not request headers.
    if getattr(exc, 'code', '') == 'P0001' and isinstance(message, str):
        return message[:350]
    return 'İşlem tamamlanamadı. Bağlantını ve hesap bilgilerini kontrol edip tekrar dene.'


class LaundryClient:
    def __init__(self, url: str, key: str):
        if not url.startswith('https://') or not key.startswith('sb_publishable_'):
            raise ValueError('Use a Supabase HTTPS URL and publishable client key only.')
        self.api = create_client(url, key, options=ClientOptions(
            auto_refresh_token=False, persist_session=False,
        ))

    def sign_in(self, email: str, password: str):
        return self.api.auth.sign_in_with_password({'email': email.strip(), 'password': password})

    def sign_up(self, name: str, email: str, password: str, redirect: str = ''):
        options = {'data': {'name': name.strip()}}
        if redirect.startswith('https://'):
            options['email_redirect_to'] = redirect
        return self.api.auth.sign_up({'email': email.strip(), 'password': password, 'options': options})

    def sign_out(self):
        self.api.auth.sign_out({'scope': 'local'})

    def authenticated(self) -> bool:
        session = self.api.auth.get_session()
        if not session:
            return False
        if session.expires_at and session.expires_at < time.time() + 90:
            self.api.auth.refresh_session()
        return True

    def command(self, action: str, **payload):
        if not self.authenticated():
            raise PermissionError('Login required')
        return self.api.rpc('cs_command', {'p_action': action, 'p_payload': payload}).execute().data

    def snapshot(self):
        self.command('refreshTimers')
        return self.api.rpc('cs_snapshot').execute().data

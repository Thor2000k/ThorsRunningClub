"""Small same-origin API and production static server; Python standard library only."""
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
import urllib.parse
import urllib.request
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = os.environ.get('DATABASE_PATH', str(ROOT / 'data' / 'club.sqlite3'))
IMPORT_TOKEN = os.environ.get('WORKOUT_IMPORT_TOKEN', '')
SECURE_COOKIE = os.environ.get('SECURE_COOKIES', 'false').lower() == 'true'
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET', '')
GOOGLE_REDIRECT_URI = os.environ.get('GOOGLE_REDIRECT_URI', '')
ALLOW_TEST_LOGIN = os.environ.get('ALLOW_TEST_LOGIN', 'false').lower() == 'true'
TEST_EMAIL = os.environ.get('TEST_LOGIN_EMAIL', 'test@example.com')
TEST_PASSWORD = os.environ.get('TEST_LOGIN_PASSWORD', 'RunClub-test-2026!')
KINDS = {'Easy run', 'Intervals', 'Tempo', 'Long run', 'Recovery'}


@contextmanager
def connect():
    db = sqlite3.connect(DB_PATH, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys = ON')
    try:
        with db:
            yield db
    finally:
        db.close()


def init_db(seed=True):
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.executescript('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY, name TEXT NOT NULL,
                alias TEXT NOT NULL DEFAULT '', email TEXT UNIQUE NOT NULL,
                password_hash TEXT, google_sub TEXT UNIQUE);
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS workouts (
                id INTEGER PRIMARY KEY, external_id TEXT UNIQUE, title TEXT NOT NULL,
                kind TEXT NOT NULL, starts_at TEXT NOT NULL, distance_km REAL NOT NULL,
                duration_minutes INTEGER NOT NULL, pace TEXT NOT NULL,
                location TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '');
            CREATE TABLE IF NOT EXISTS attendance (
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
                PRIMARY KEY(user_id, workout_id));
            CREATE TABLE IF NOT EXISTS login_attempts (
                client TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL);
        ''')
        columns = {row['name'] for row in db.execute('PRAGMA table_info(workouts)')}
        if 'translations' not in columns:
            db.execute("ALTER TABLE workouts ADD COLUMN translations TEXT NOT NULL DEFAULT '{}'")
        user_columns = {row['name'] for row in db.execute('PRAGMA table_info(users)')}
        if 'alias' not in user_columns:
            db.execute("ALTER TABLE users ADD COLUMN alias TEXT NOT NULL DEFAULT ''")
        if 'google_sub' not in user_columns:
            # SQLite cannot add a UNIQUE column constraint with ALTER TABLE;
            # add the nullable identity column, then enforce uniqueness with
            # an index. Existing password users remain linkable to Google.
            db.execute("ALTER TABLE users ADD COLUMN google_sub TEXT")
        db.execute("CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_unique ON users(google_sub)")
        if ALLOW_TEST_LOGIN and not db.execute('SELECT 1 FROM users WHERE email=?', (TEST_EMAIL.lower(),)).fetchone():
            db.execute('INSERT INTO users (name,alias,email,password_hash) VALUES (?,?,?,?)',
                       ('Local test account', 'Test Runner', TEST_EMAIL.lower(), password_hash(TEST_PASSWORD)))
        if seed and not db.execute('SELECT 1 FROM workouts LIMIT 1').fetchone():
            from zoneinfo import ZoneInfo
            now = datetime.now(ZoneInfo('Europe/Copenhagen'))
            monday = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
            templates = [
                (0, 18, 'The Monday reset', 'Easy run', 6, 40, '6:00–6:30 /km', 'Søerne, Dronning Louises Bro, Copenhagen', 'A relaxed lap around the lakes. Meet on the bridge, ready to run. We regroup along the way.'),
                (2, 18, 'A little speed, a lot of fun', 'Intervals', 8, 55, 'Your own pace', 'Fælledparken, Copenhagen', '2 km warm-up, then 6 × 400 m with 200 m easy jogging between efforts. Finish with a relaxed cool-down.'),
                (4, 17, 'Friday flow', 'Tempo', 7, 45, '5:15–5:45 /km', 'Kastellet, Copenhagen', 'Start easy, settle into a comfortably hard effort for 20 minutes, then ease back down. Meet at the south entrance.'),
                (5, 9, 'The weekend wander', 'Long run', 14, 90, '6:00–6:30 /km', 'Dyrehaven, Klampenborg', 'Fresh air, forest trails, and a little more time on our feet. Bring water. Optional coffee near the station afterwards.'),
                (6, 10, 'Easy like Sunday', 'Recovery', 5, 35, 'Conversation pace', 'Amager Strandpark, Copenhagen', 'An easy coastal loop. Walk breaks are welcome. Meet by the entrance at Amager Strand metro.'),
            ]
            for week in range(3):
                for day, hour, title, kind, distance, duration, pace, location, notes in templates:
                    starts = monday + timedelta(weeks=week, days=day, hours=hour)
                    db.execute('INSERT INTO workouts (external_id,title,kind,starts_at,distance_km,duration_minutes,pace,location,notes) VALUES (?,?,?,?,?,?,?,?,?)',
                               (f'demo-{week}-{day}', title, kind, starts.astimezone(timezone.utc).isoformat(), distance, duration, pace, location, notes))


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
    return f'{salt}:{digest}'


def google_enabled():
    return bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)


def redirect_uri(handler):
    return GOOGLE_REDIRECT_URI or f"http{'s' if SECURE_COOKIE else ''}://{handler.headers.get('Host', '127.0.0.1:8000')}/api/auth/google/callback"


def safe_return_to(value):
    return value if isinstance(value, str) and value.startswith('/') and not value.startswith('//') else '/'


def origin_allowed(origin, host):
    """Allow Vite's localhost proxy during development; require same host in production."""
    if not origin:
        return True
    origin_parts, host_parts = urlsplit(origin), urlsplit(f'//{host}')
    if origin_parts.scheme not in ('http', 'https') or not origin_parts.hostname or not host_parts.hostname:
        return False
    loopback = {'localhost', '127.0.0.1', '::1'}
    if origin_parts.hostname in loopback and host_parts.hostname in loopback:
        return True
    return origin_parts.hostname == host_parts.hostname and (origin_parts.scheme == 'https' or host_parts.hostname in loopback)


def google_request(url, values):
    body = urllib.parse.urlencode(values).encode()
    request = urllib.request.Request(url, data=body, headers={'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json'})
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read())


def create_session(db, user_id):
    token = secrets.token_urlsafe(32)
    db.execute('DELETE FROM sessions WHERE user_id=?', (user_id,))
    db.execute('INSERT INTO sessions VALUES (?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), user_id, int(time.time()) + 2592000))
    return token


def validate_workout(value):
    if not isinstance(value, dict):
        raise ValueError('Each workout must be an object.')
    result = {}
    for key, limit in [('external_id', 120), ('title', 120), ('kind', 30), ('pace', 80), ('location', 250), ('notes', 3000)]:
        item = value.get(key, '' if key == 'notes' else None)
        if not isinstance(item, str) or len(item) > limit or (key != 'notes' and not item.strip()):
            raise ValueError(f'{key} must be text, at most {limit} characters, and is required except notes.')
        result[key] = item.strip()
    if result['kind'] not in KINDS:
        raise ValueError('kind must be Easy run, Intervals, Tempo, Long run, or Recovery.')
    try:
        starts = datetime.fromisoformat(value['starts_at'].replace('Z', '+00:00'))
        if starts.tzinfo is None:
            raise ValueError()
        result['starts_at'] = starts.astimezone(timezone.utc).isoformat()
    except (KeyError, ValueError, TypeError, AttributeError):
        raise ValueError('starts_at must be an ISO 8601 date and time with a timezone offset.')
    distance, duration = value.get('distance_km'), value.get('duration_minutes')
    if type(distance) not in (int, float) or not 0 < distance <= 500:
        raise ValueError('distance_km must be a number greater than 0 and at most 500.')
    if type(duration) is not int or not 0 < duration <= 10080:
        raise ValueError('duration_minutes must be an integer between 1 and 10080.')
    result.update(distance_km=distance, duration_minutes=duration)
    translations = value.get('translations', {})
    if not isinstance(translations, dict) or set(translations) - {'da', 'en'}:
        raise ValueError('translations must be an object containing only da and/or en.')
    for language, fields in translations.items():
        if not isinstance(fields, dict) or set(fields) - {'title', 'notes', 'pace', 'location'}:
            raise ValueError('Translation fields must be title, notes, pace, or location.')
        for field, text in fields.items():
            limit = {'title': 120, 'notes': 3000, 'pace': 80, 'location': 250}[field]
            if not isinstance(text, str) or not text.strip() or len(text) > limit:
                raise ValueError(f'Invalid {language} translation for {field}.')
    result['translations'] = json.dumps(translations, ensure_ascii=False)
    return result


def import_workouts(db, values):
    if not isinstance(values, list) or not 1 <= len(values) <= 100:
        raise ValueError('workouts must be an array containing 1 to 100 workouts.')
    workouts = [validate_workout(item) for item in values]
    if len({w['external_id'] for w in workouts}) != len(workouts):
        raise ValueError('external_id must be unique within the import.')
    for workout in workouts:
        db.execute('''INSERT INTO workouts (external_id,title,kind,starts_at,distance_km,duration_minutes,pace,location,notes,translations)
            VALUES (:external_id,:title,:kind,:starts_at,:distance_km,:duration_minutes,:pace,:location,:notes,:translations)
            ON CONFLICT(external_id) DO UPDATE SET title=excluded.title,kind=excluded.kind,starts_at=excluded.starts_at,
            distance_km=excluded.distance_km,duration_minutes=excluded.duration_minutes,pace=excluded.pace,
            location=excluded.location,notes=excluded.notes,translations=excluded.translations''', workout)
    db.commit()
    return {'imported': len(workouts)}


def serialize_workout(row):
    value = dict(row)
    value['translations'] = json.loads(value['translations'])
    return value


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'dist'), **kwargs)

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        self.send_header('X-Frame-Options', 'DENY')
        super().end_headers()

    def reply(self, status, value, cookie=None):
        data = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.end_headers()
        self.wfile.write(data)

    def body(self):
        if self.headers.get('Content-Type', '').split(';')[0].strip() != 'application/json':
            raise ValueError('Use Content-Type: application/json.')
        size = int(self.headers.get('Content-Length', '0'))
        if not 0 < size <= 1_000_000:
            raise ValueError('Request body must be between 1 byte and 1 MB.')
        data = json.loads(self.rfile.read(size))
        if not isinstance(data, dict):
            raise ValueError('Request body must be a JSON object.')
        return data

    def session_token(self):
        cookies = SimpleCookie()
        try:
            cookies.load(self.headers.get('Cookie', ''))
            token = cookies.get('club_session')
            return hashlib.sha256(token.value.encode()).hexdigest() if token else ''
        except Exception:
            return ''

    def user(self, db):
        return db.execute('SELECT u.id,u.name,u.alias,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',
                          (self.session_token(), int(time.time()))).fetchone()

    def session_cookie(self, token, age=2592000):
        return f'club_session={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={age}' + ('; Secure' if SECURE_COOKIE else '')

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/api/auth/config':
            return self.reply(200, {'google_enabled': google_enabled(), 'test_login_enabled': ALLOW_TEST_LOGIN})
        if path == '/api/auth/google/start':
            if not google_enabled():
                return self.redirect('/?auth_error=google_not_configured')
            state = secrets.token_urlsafe(32)
            query = urllib.parse.urlencode({'client_id': GOOGLE_CLIENT_ID, 'redirect_uri': redirect_uri(self),
                                            'response_type': 'code', 'scope': 'openid email profile',
                                            'state': state, 'access_type': 'online', 'prompt': 'select_account',
                                            'return_to': safe_return_to(urllib.parse.parse_qs(urlsplit(self.path).query).get('return_to', ['/'])[0])})
            return self.redirect(f'https://accounts.google.com/o/oauth2/v2/auth?{query}', self.oauth_cookie(state))
        if path == '/api/auth/google/callback':
            return self.google_callback()
        if path == '/mcp':
            origin = self.headers.get('Origin')
            if not origin_allowed(origin, self.headers.get('Host', '')):
                return self.reply(403, {'error': 'Cross-origin requests are not allowed.'})
            return self.reply(405, {'error': 'Use POST for the stateless MCP endpoint.'})
        if path.startswith('/api/'):
            with connect() as db:
                user = self.user(db)
                if path == '/api/me':
                    return self.reply(200, {'user': dict(user) if user else None})
                if path == '/api/workouts':
                    rows = db.execute('''SELECT w.*, (SELECT COUNT(*) FROM attendance a WHERE a.workout_id=w.id) AS attendees,
                        EXISTS(SELECT 1 FROM attendance a WHERE a.workout_id=w.id AND a.user_id=?) AS joined
                        FROM workouts w ORDER BY starts_at''', (user['id'] if user else None,)).fetchall()
                    return self.reply(200, {'workouts': [serialize_workout(row) for row in rows]})
                return self.reply(404, {'error': 'API route not found.'})
        if not (ROOT / 'dist' / 'index.html').exists():
            return self.reply(503, {'error': 'Frontend not built. Run npm run dev, or npm run build.'})
        if path == '/':
            self.path = '/index.html'
        return super().do_GET()

    def redirect(self, location, cookie=None):
        self.send_response(302)
        self.send_header('Location', location)
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.send_header('Content-Length', '0')
        self.end_headers()

    def oauth_cookie(self, state, age=600):
        return f'club_oauth_state={state}; Path=/; HttpOnly; SameSite=Lax; Max-Age={age}' + ('; Secure' if SECURE_COOKIE else '')

    def oauth_state(self):
        cookies = SimpleCookie()
        try:
            cookies.load(self.headers.get('Cookie', ''))
            return cookies.get('club_oauth_state').value if cookies.get('club_oauth_state') else ''
        except Exception:
            return ''

    def google_callback(self):
        if not google_enabled():
            return self.redirect('/?auth_error=google_not_configured')
        query = urllib.parse.parse_qs(urlsplit(self.path).query)
        state = query.get('state', [''])[0]
        if not state or not hmac.compare_digest(state, self.oauth_state()):
            return self.redirect('/?auth_error=google_state_invalid', self.oauth_cookie('', 0))
        if query.get('error'):
            return self.redirect('/?auth_error=google_cancelled', self.oauth_cookie('', 0))
        code = query.get('code', [''])[0]
        try:
            tokens = google_request('https://oauth2.googleapis.com/token', {
                'code': code, 'client_id': GOOGLE_CLIENT_ID, 'client_secret': GOOGLE_CLIENT_SECRET,
                'redirect_uri': redirect_uri(self), 'grant_type': 'authorization_code',
            })
            access_token = tokens.get('access_token')
            if not access_token:
                raise ValueError('Google did not return an access token.')
            request = urllib.request.Request('https://openidconnect.googleapis.com/v1/userinfo', headers={'Authorization': f'Bearer {access_token}', 'Accept': 'application/json'})
            with urllib.request.urlopen(request, timeout=10) as response:
                profile = json.loads(response.read())
            subject, email = profile.get('sub'), profile.get('email', '').strip().lower()
            if not subject or not email or profile.get('email_verified') is not True:
                raise ValueError('Google did not return a verified email identity.')
            with connect() as db:
                row = db.execute('SELECT * FROM users WHERE google_sub=? OR email=?', (subject, email)).fetchone()
                if row:
                    if row['google_sub'] and row['google_sub'] != subject:
                        raise ValueError('This email is linked to a different Google account.')
                    db.execute('UPDATE users SET google_sub=?, name=? WHERE id=?', (subject, profile.get('name') or row['name'], row['id']))
                    user_id = row['id']
                else:
                    alias = (profile.get('name') or email.split('@')[0]).strip()[:80]
                    user_id = db.execute('INSERT INTO users (name,alias,email,password_hash,google_sub) VALUES (?,?,?,?,?)',
                                         (profile.get('name') or alias, alias, email, '', subject)).lastrowid
                token = create_session(db, user_id)
                db.commit()
            return self.redirect('/?auth=success', self.session_cookie(token))
        except Exception:
            return self.redirect('/?auth_error=google_failed', self.oauth_cookie('', 0))

    def do_POST(self):
        self.mutate()

    def do_DELETE(self):
        self.mutate()

    def do_PATCH(self):
        self.mutate()

    def mutate(self):
        origin = self.headers.get('Origin')
        if not origin_allowed(origin, self.headers.get('Host', '')):
            return self.reply(403, {'error': 'Cross-origin writes are not allowed.'})
        try:
            self.route_mutation()
        except (ValueError, UnicodeDecodeError) as error:
            self.reply(400, {'error': str(error)})
        except sqlite3.Error:
            self.reply(500, {'error': 'Database operation failed. Please try again.'})

    def route_mutation(self):
        path = urlsplit(self.path).path
        if path == '/mcp':
            if self.command != 'POST':
                return self.reply(405, {'error': 'Use POST for the stateless MCP endpoint.'})
            if not IMPORT_TOKEN or not hmac.compare_digest(self.headers.get('Authorization', ''), f'Bearer {IMPORT_TOKEN}'):
                return self.reply(401, {'error': 'A valid import token is required.'})
            from mcp_protocol import handle_message, PROTOCOLS
            version = self.headers.get('MCP-Protocol-Version', '2025-03-26')
            if version not in PROTOCOLS:
                return self.reply(400, {'error': 'Unsupported MCP protocol version.'})
            result = handle_message(self.body())
            if result is None:
                self.send_response(202)
                self.send_header('Content-Length', '0')
                self.end_headers()
                return
            return self.reply(200, result)
        with connect() as db:
            if path == '/api/workouts/import' and self.command == 'POST':
                supplied = self.headers.get('Authorization', '')
                if not IMPORT_TOKEN:
                    return self.reply(503, {'error': 'Workout imports are disabled. Configure WORKOUT_IMPORT_TOKEN on the server.'})
                if not hmac.compare_digest(supplied, f'Bearer {IMPORT_TOKEN}'):
                    return self.reply(401, {'error': 'A valid import token is required.'})
                return self.reply(200, import_workouts(db, self.body().get('workouts')))
            if path in ('/api/register', '/api/login') and self.command == 'POST':
                if not ALLOW_TEST_LOGIN:
                    return self.reply(404, {'error': 'Password login is disabled. Use Google sign-in.'})
                data = self.body()
                email, password = data.get('email', ''), data.get('password', '')
                if not isinstance(email, str) or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email.strip()) or len(email) > 254:
                    raise ValueError('Enter a valid email address.')
                if not isinstance(password, str) or not 8 <= len(password) <= 128:
                    raise ValueError('Password must contain 8 to 128 characters.')
                email = email.strip().lower()
                client = self.client_address[0]
                now = int(time.time())
                db.execute('DELETE FROM login_attempts WHERE reset_at<=?', (now,))
                db.execute('DELETE FROM sessions WHERE expires_at<=?', (now,))
                db.execute('INSERT INTO login_attempts VALUES (?,1,?) ON CONFLICT(client) DO UPDATE SET attempts=attempts+1', (client, now + 900))
                attempts = db.execute('SELECT attempts FROM login_attempts WHERE client=?', (client,)).fetchone()[0]
                db.commit()
                if attempts > 30:
                    return self.reply(429, {'error': 'Too many attempts. Please try again in 15 minutes.'})
                if path == '/api/register':
                    name = data.get('name', '')
                    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80:
                        raise ValueError('Name must contain 1 to 80 characters.')
                    try:
                        cursor = db.execute('INSERT INTO users (name,email,password_hash) VALUES (?,?,?)', (name.strip(), email, password_hash(password)))
                    except sqlite3.IntegrityError:
                        return self.reply(409, {'error': 'An account with this email already exists. Try signing in.'})
                    user = db.execute('SELECT id,name,alias,email FROM users WHERE id=?', (cursor.lastrowid,)).fetchone()
                else:
                    row = db.execute('SELECT * FROM users WHERE email=?', (email,)).fetchone()
                    stored = row['password_hash'] if row and row['password_hash'] else password_hash('dummy-password', '0' * 32)
                    if not hmac.compare_digest(password_hash(password, stored.split(':')[0]), stored) or row is None:
                        return self.reply(401, {'error': 'Email or password is incorrect.'})
                    user = {key: row[key] for key in ('id', 'name', 'alias', 'email')}
                token = secrets.token_urlsafe(32)
                db.execute('DELETE FROM sessions WHERE token_hash=?', (self.session_token(),))
                db.execute('INSERT INTO sessions VALUES (?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), user['id'], now + 2592000))
                db.commit()
                return self.reply(201 if path == '/api/register' else 200, {'user': dict(user)}, self.session_cookie(token))
            if path == '/api/logout' and self.command == 'POST':
                self.body()
                db.execute('DELETE FROM sessions WHERE token_hash=?', (self.session_token(),))
                db.commit()
                return self.reply(200, {'ok': True}, self.session_cookie('', 0))
            if path == '/api/me' and self.command == 'PATCH':
                user = self.user(db)
                if not user:
                    return self.reply(401, {'error': 'Sign in to edit your alias.'})
                data = self.body()
                alias = data.get('alias')
                if not isinstance(alias, str) or not 1 <= len(alias.strip()) <= 80:
                    raise ValueError('Alias must contain 1 to 80 characters.')
                db.execute('UPDATE users SET alias=? WHERE id=?', (alias.strip(), user['id']))
                db.commit()
                updated = db.execute('SELECT id,name,alias,email FROM users WHERE id=?', (user['id'],)).fetchone()
                return self.reply(200, {'user': dict(updated)})
            match = re.fullmatch(r'/api/workouts/(\d+)/attendance', path)
            if match:
                self.body()
                user = self.user(db)
                if not user:
                    return self.reply(401, {'error': 'Sign in to join a run.'})
                workout = db.execute('SELECT * FROM workouts WHERE id=?', (int(match[1]),)).fetchone()
                if not workout:
                    return self.reply(404, {'error': 'Workout not found.'})
                if self.command == 'POST':
                    if datetime.fromisoformat(workout['starts_at']) <= datetime.now(timezone.utc):
                        return self.reply(409, {'error': 'This run has already started.'})
                    db.execute('INSERT OR IGNORE INTO attendance VALUES (?,?)', (user['id'], workout['id']))
                else:
                    db.execute('DELETE FROM attendance WHERE user_id=? AND workout_id=?', (user['id'], workout['id']))
                db.commit()
                return self.reply(200, {'joined': self.command == 'POST'})
            return self.reply(404, {'error': 'API route not found.'})


if __name__ == '__main__':
    init_db(seed=os.environ.get('SEED_DEMO', 'true').lower() == 'true')
    host, port = os.environ.get('HOST', '127.0.0.1'), int(os.environ.get('PORT', '8000'))
    print(f'Thor’s Running Club API: http://{host}:{port}', flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()

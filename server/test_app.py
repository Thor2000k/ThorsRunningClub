import http.client
import json
import tempfile
import threading
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from http.server import ThreadingHTTPServer

import app
from mcp_protocol import handle_message


class QuietHandler(app.Handler):
    def log_message(self, *args):
        pass


class ClubTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old_path, self.old_token, self.old_test_login = app.DB_PATH, app.IMPORT_TOKEN, app.ALLOW_TEST_LOGIN
        app.DB_PATH = str(Path(self.temp.name) / 'test.sqlite3')
        app.IMPORT_TOKEN = 'test-secret'
        app.ALLOW_TEST_LOGIN = True
        app.init_db(seed=False)
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), QuietHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.cookie = None
        self.workout = {
            'external_id': 'test-run', 'title': 'Sunday run', 'kind': 'Easy run',
            'starts_at': (datetime.now(timezone.utc) + timedelta(days=10)).isoformat(),
            'distance_km': 5.5, 'duration_minutes': 35, 'pace': '6:00 /km',
            'location': 'Copenhagen', 'notes': 'Meet at the bridge.',
            'translations': {'da': {'title': 'Søndagstur', 'notes': 'Vi mødes på broen.'}},
        }

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        app.DB_PATH, app.IMPORT_TOKEN, app.ALLOW_TEST_LOGIN = self.old_path, self.old_token, self.old_test_login
        self.temp.cleanup()

    def request(self, path, method='GET', data=None, headers=None):
        request_headers = {'Content-Type': 'application/json', **(headers or {})}
        if self.cookie:
            request_headers['Cookie'] = self.cookie
        client = http.client.HTTPConnection('127.0.0.1', self.server.server_port)
        client.request(method, path, json.dumps(data) if data is not None else None, request_headers)
        response = client.getresponse()
        if response.getheader('Set-Cookie'):
            self.cookie = response.getheader('Set-Cookie').split(';')[0]
        body = response.read()
        result = (response.status, json.loads(body) if body else None)
        client.close()
        return result

    def import_run(self, workout=None):
        return self.request('/api/workouts/import', 'POST', {'workouts': [workout or self.workout]}, {'Authorization': 'Bearer test-secret'})

    def register(self):
        return self.request('/api/register', 'POST', {'name': 'Test Runner', 'email': 'runner@example.com', 'password': 'running-test-password'})

    def test_accounts_attendance_and_session_persistence(self):
        self.assertEqual(self.import_run()[0], 200)
        self.assertEqual(self.request('/api/workouts/1/attendance', 'POST', {})[0], 401)
        self.assertEqual(self.register()[0], 201)
        self.assertEqual(self.request('/api/me')[1]['user']['name'], 'Test Runner')
        for _ in range(2):
            self.assertEqual(self.request('/api/workouts/1/attendance', 'POST', {})[0], 200)
        run = self.request('/api/workouts')[1]['workouts'][0]
        self.assertEqual(run['attendees'], 1)
        self.assertTrue(run['joined'])
        updated = {**self.workout, 'title': 'Updated Sunday run'}
        self.assertEqual(self.import_run(updated)[0], 200)
        self.assertEqual(self.request('/api/workouts')[1]['workouts'][0]['attendees'], 1)
        app.init_db(seed=False)
        self.assertEqual(self.request('/api/me')[1]['user']['email'], 'runner@example.com')
        self.assertEqual(self.request('/api/logout', 'POST', {})[0], 200)
        self.assertIsNone(self.request('/api/me')[1]['user'])
        self.assertEqual(self.request('/api/login', 'POST', {'email': 'RUNNER@example.com', 'password': 'running-test-password'})[0], 200)
        self.assertEqual(self.request('/api/workouts/1/attendance', 'DELETE', {})[0], 200)
        self.assertEqual(self.request('/api/workouts')[1]['workouts'][0]['attendees'], 0)
        with app.connect() as db:
            stored = db.execute('SELECT password_hash FROM users').fetchone()[0]
            self.assertNotIn('running-test-password', stored)

    def test_import_authorization_validation_and_atomicity(self):
        self.assertEqual(self.request('/api/workouts/import', 'POST', {'workouts': [self.workout]})[0], 401)
        invalid = {**self.workout, 'external_id': 'invalid', 'starts_at': '2026-10-10T12:00:00'}
        result = self.request('/api/workouts/import', 'POST', {'workouts': [self.workout, invalid]}, {'Authorization': 'Bearer test-secret'})
        self.assertEqual(result[0], 400)
        self.assertEqual(self.request('/api/workouts')[1]['workouts'], [])
        for field, value in [('distance_km', -1), ('distance_km', float('nan')), ('duration_minutes', True), ('translations', {'de': {}}), ('kind', 'Rolig tur')]:
            self.assertEqual(self.import_run({**self.workout, field: value})[0], 400)
        self.assertEqual(self.import_run()[0], 200)
        self.assertEqual(self.import_run()[0], 200)
        runs = self.request('/api/workouts')[1]['workouts']
        self.assertEqual(len(runs), 1)
        self.assertEqual(runs[0]['translations']['da']['title'], 'Søndagstur')

    def test_origin_and_past_run_protection(self):
        self.assertEqual(self.request('/api/register', 'POST', {}, {'Origin': 'https://evil.example'})[0], 403)
        self.assertEqual(self.request('/api/register', 'POST', {'name': 'Local Runner', 'email': 'local@example.com', 'password': 'local-password-123'}, {'Origin': 'http://localhost:5173'})[0], 201)
        self.register()
        self.import_run({**self.workout, 'starts_at': '2020-01-01T10:00:00+01:00'})
        self.assertEqual(self.request('/api/workouts/1/attendance', 'POST', {})[0], 409)
        self.assertEqual(self.request('/api/workouts/999/attendance', 'POST', {})[0], 404)
        self.assertEqual(self.request('/api/login', 'POST', {'email': 'runner@example.com', 'password': 'incorrect-password'})[0], 401)

    def test_mcp_discovery_and_write_tools(self):
        headers = {'Authorization': 'Bearer test-secret', 'MCP-Protocol-Version': '2025-06-18'}
        message = {'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {'protocolVersion': '2025-06-18'}}
        self.assertEqual(self.request('/mcp', 'POST', message)[0], 401)
        status, response = self.request('/mcp', 'POST', message, headers)
        self.assertEqual(status, 200)
        self.assertEqual(response['result']['protocolVersion'], '2025-06-18')
        self.assertEqual(self.request('/mcp', 'POST', {'jsonrpc': '2.0', 'method': 'notifications/initialized'}, headers)[0], 202)
        tools = handle_message({'jsonrpc': '2.0', 'id': 2, 'method': 'tools/list'})['result']['tools']
        self.assertEqual({tool['name'] for tool in tools}, {'upsert_workouts', 'list_workouts'})
        message.update(method='tools/call', params={'name': 'upsert_workouts', 'arguments': {'workouts': [self.workout]}})
        result = self.request('/mcp', 'POST', message, headers)[1]['result']
        self.assertFalse(result['isError'])
        self.assertEqual(self.request('/api/workouts')[1]['workouts'][0]['title'], 'Sunday run')
        message['params'] = {'name': 'list_workouts', 'arguments': {}}
        content = self.request('/mcp', 'POST', message, headers)[1]['result']['content'][0]['text']
        self.assertNotIn('email', content)
        self.assertEqual(len(json.loads(content)['workouts']), 1)
        message['params'] = {'name': 'upsert_workouts', 'arguments': {'workouts': [{**self.workout, 'distance_km': 0}]}}
        self.assertTrue(self.request('/mcp', 'POST', message, headers)[1]['result']['isError'])

    def test_mcp_copenhagen_date_filter_includes_midnight_boundary(self):
        self.import_run({**self.workout, 'starts_at': '2026-10-01T00:30:00+02:00'})
        response = handle_message({'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call', 'params': {'name': 'list_workouts', 'arguments': {'from_date': '2026-10-01', 'to_date': '2026-10-01'}}})
        self.assertEqual(len(json.loads(response['result']['content'][0]['text'])['workouts']), 1)

    def test_local_test_account_is_explicit_and_alias_is_editable(self):
        config = self.request('/api/auth/config')[1]
        self.assertTrue(config['test_login_enabled'])
        self.assertFalse(config['google_enabled'])
        self.assertEqual(self.request('/api/login', 'POST', {'email': 'test@example.com', 'password': 'RunClub-test-2026!'})[0], 200)
        self.assertEqual(self.request('/api/me')[1]['user']['alias'], 'Test Runner')
        self.assertEqual(self.request('/api/me', 'PATCH', {'alias': 'Night Owl'})[1]['user']['alias'], 'Night Owl')
        self.assertEqual(self.request('/api/me', 'PATCH', {'alias': ''})[0], 400)


if __name__ == '__main__':
    unittest.main()

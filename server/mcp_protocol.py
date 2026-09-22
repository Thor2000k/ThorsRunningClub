"""Bounded MCP tool surface shared by local stdio and stateless Streamable HTTP."""
import json
import sqlite3

PROTOCOLS = ('2025-03-26', '2025-06-18', '2025-11-25')
LOCALIZED_FIELDS = {key: {'type': 'string', 'minLength': 1, 'maxLength': limit}
                    for key, limit in [('title', 120), ('notes', 3000), ('pace', 80), ('location', 250)]}
WORKOUT_SCHEMA = {
    'type': 'object',
    'properties': {
        'external_id': {'type': 'string', 'minLength': 1, 'maxLength': 120, 'description': 'Stable unique ID. Reuse this ID to update a workout without losing attendance.'},
        'title': {'type': 'string', 'minLength': 1, 'maxLength': 120},
        'kind': {'type': 'string', 'enum': ['Easy run', 'Intervals', 'Tempo', 'Long run', 'Recovery']},
        'starts_at': {'type': 'string', 'format': 'date-time', 'description': 'ISO 8601 including UTC offset. Use the correct Copenhagen offset for the date.'},
        'distance_km': {'type': 'number', 'exclusiveMinimum': 0, 'maximum': 500},
        'duration_minutes': {'type': 'integer', 'minimum': 1, 'maximum': 10080},
        'pace': {'type': 'string', 'minLength': 1, 'maxLength': 80},
        'location': {'type': 'string', 'minLength': 1, 'maxLength': 250},
        'notes': {'type': 'string', 'maxLength': 3000},
        'translations': {
            'type': 'object', 'additionalProperties': False,
            'description': 'Provide both Danish (da) and English (en) text where possible. Base fields are the fallback.',
            'properties': {lang: {'type': 'object', 'properties': LOCALIZED_FIELDS, 'additionalProperties': False} for lang in ('da', 'en')},
        },
    },
    'required': ['external_id', 'title', 'kind', 'starts_at', 'distance_km', 'duration_minutes', 'pace', 'location'],
    'additionalProperties': False,
}
TOOLS = [
    {'name': 'list_workouts', 'description': 'List the running club schedule with attendance counts. Never includes member identities or emails. Optionally filter by inclusive YYYY-MM-DD Copenhagen dates.',
     'inputSchema': {'type': 'object', 'properties': {'from_date': {'type': 'string', 'format': 'date'}, 'to_date': {'type': 'string', 'format': 'date'}}, 'additionalProperties': False},
     'annotations': {'readOnlyHint': True, 'destructiveHint': False, 'idempotentHint': True, 'openWorldHint': False}},
    {'name': 'upsert_workouts', 'description': 'Publish or update 1–100 running workouts atomically. Reuse external_id on edits to preserve sign-ups. Supply complete workout fields, including all desired translations on every update. Prefer both Danish and English. Ask the organizer to confirm the plan before publishing.',
     'inputSchema': {'type': 'object', 'properties': {'workouts': {'type': 'array', 'items': WORKOUT_SCHEMA, 'minItems': 1, 'maxItems': 100}}, 'required': ['workouts'], 'additionalProperties': False},
     'annotations': {'readOnlyHint': False, 'destructiveHint': True, 'idempotentHint': True, 'openWorldHint': False}},
]


def call_tool(name, arguments):
    import app
    from datetime import date, datetime
    from zoneinfo import ZoneInfo
    if not isinstance(arguments, dict):
        raise ValueError('Tool arguments must be an object.')
    with app.connect() as db:
        if name == 'upsert_workouts':
            if set(arguments) != {'workouts'}:
                raise ValueError('Provide only the workouts argument.')
            return app.import_workouts(db, arguments.get('workouts'))
        if name == 'list_workouts':
            if set(arguments) - {'from_date', 'to_date'}:
                raise ValueError('Supported arguments: from_date, to_date.')
            bounds = {}
            for key, value in arguments.items():
                if not isinstance(value, str):
                    raise ValueError(f'{key} must be a YYYY-MM-DD date.')
                bounds[key] = date.fromisoformat(value)
            if bounds.get('from_date', date.min) > bounds.get('to_date', date.max):
                raise ValueError('from_date must be before or equal to to_date.')
            rows = db.execute('SELECT w.*, (SELECT COUNT(*) FROM attendance a WHERE a.workout_id=w.id) AS attendees FROM workouts w ORDER BY starts_at').fetchall()
            result = []
            for row in rows:
                local_day = datetime.fromisoformat(row['starts_at']).astimezone(ZoneInfo('Europe/Copenhagen')).date()
                if bounds.get('from_date', date.min) <= local_day <= bounds.get('to_date', date.max):
                    result.append(app.serialize_workout(row))
            return {'workouts': result}
    raise ValueError(f'Unknown tool: {name}')


def handle_message(message):
    request_id = message.get('id') if isinstance(message, dict) else None
    def error(code, text):
        return {'jsonrpc': '2.0', 'id': request_id, 'error': {'code': code, 'message': text}}
    if not isinstance(message, dict) or message.get('jsonrpc') != '2.0' or not isinstance(message.get('method'), str):
        return error(-32600, 'Invalid Request')
    if 'id' not in message:
        return None
    params = message.get('params', {})
    if not isinstance(params, dict):
        return error(-32602, 'params must be an object')
    method = message['method']
    if method == 'initialize':
        requested = params.get('protocolVersion')
        result = {'protocolVersion': requested if requested in PROTOCOLS else PROTOCOLS[-1], 'capabilities': {'tools': {}},
                  'serverInfo': {'name': 'thors-running-club', 'version': '1.0.0'},
                  'instructions': 'Manage the club schedule. Keep workout kind values in English; provide da/en translations for human-facing text. Reuse external_id for updates. Confirm dates and location with the organizer before publishing.'}
    elif method == 'ping':
        result = {}
    elif method == 'tools/list':
        result = {'tools': TOOLS}
    elif method == 'tools/call':
        name = params.get('name')
        if name not in {tool['name'] for tool in TOOLS}:
            return error(-32602, 'Unknown tool')
        try:
            value = call_tool(name, params.get('arguments', {}))
            result = {'content': [{'type': 'text', 'text': json.dumps(value, ensure_ascii=False)}], 'isError': False}
        except (ValueError, TypeError) as exc:
            result = {'content': [{'type': 'text', 'text': str(exc)}], 'isError': True}
        except sqlite3.Error:
            result = {'content': [{'type': 'text', 'text': 'Database operation failed.'}], 'isError': True}
    else:
        return error(-32601, 'Method not found')
    return {'jsonrpc': '2.0', 'id': request_id, 'result': result}

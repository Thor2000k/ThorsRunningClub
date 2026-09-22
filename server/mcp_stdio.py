"""Local trusted MCP client entrypoint. No HTTP server or import token required."""
import json
import os
import sys
from app import init_db
from mcp_protocol import handle_message


def main():
    init_db(seed=os.environ.get('SEED_DEMO', 'true').lower() == 'true')
    for line in sys.stdin:
        try:
            result = handle_message(json.loads(line))
        except json.JSONDecodeError:
            result = {'jsonrpc': '2.0', 'id': None, 'error': {'code': -32700, 'message': 'Parse error'}}
        if result is not None:
            print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()

import json, sys
try:
    with open('api_root_cause.json') as f:
        data = json.load(f)
    assert data == {'error': 'KeyError', 'file': 'client.py', 'line': 73}
    print('VERIFIER_PASS')
    sys.exit(0)
except Exception as e:
    print(f'VERIFIER_FAIL: {e}')
    sys.exit(1)

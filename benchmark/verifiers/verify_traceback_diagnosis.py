import json, sys
try:
    with open('root_cause.json') as f:
        data = json.load(f)
    assert data == {'error': 'TypeError', 'file': 'parser.py', 'line': 27}
    print('VERIFIER_PASS')
    sys.exit(0)
except Exception as e:
    print(f'VERIFIER_FAIL: {e}')
    sys.exit(1)

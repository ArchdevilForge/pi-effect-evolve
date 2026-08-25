import json, sys
try:
    with open('worker_errors.json') as f:
        data = json.load(f)
    assert data.get('ValueError') == 2
    assert data.get('ConnectionError') == 1
    print('VERIFIER_PASS')
    sys.exit(0)
except Exception as e:
    print(f'VERIFIER_FAIL: {e}')
    sys.exit(1)

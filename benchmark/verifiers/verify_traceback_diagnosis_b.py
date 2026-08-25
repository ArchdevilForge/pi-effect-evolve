import json, sys
try:
    with open('job_root_cause.json') as f:
        data = json.load(f)
    assert data == {'error': 'FileNotFoundError', 'file': 'loader.py', 'line': 18}
    print('VERIFIER_PASS')
    sys.exit(0)
except Exception as e:
    print(f'VERIFIER_FAIL: {e}')
    sys.exit(1)

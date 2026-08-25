import json, sys
try:
    with open('service_issues.json') as f:
        data = json.load(f)
    assert data == ['anonymous_access', 'tls_disabled', 'retries_disabled']
    print('VERIFIER_PASS')
    sys.exit(0)
except Exception as e:
    print(f'VERIFIER_FAIL: {e}')
    sys.exit(1)

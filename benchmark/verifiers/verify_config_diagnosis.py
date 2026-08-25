import json, sys
try:
    with open('config_issues.json') as f:
        data = json.load(f)
    assert data == ['debug_enabled', 'database_ssl_disabled', 'plaintext_password']
    print('VERIFIER_PASS')
    sys.exit(0)
except Exception as e:
    print(f'VERIFIER_FAIL: {e}')
    sys.exit(1)

import json, sys
try:
    with open('healthy_services.json') as f:
        data = json.load(f)
    assert data == [
        {'service': 'payments', 'instanceId': 'p-1', 'url': 'https://payments-1'},
        {'service': 'search', 'instanceId': 's-1', 'url': 'https://search-1'},
    ]
    print('VERIFIER_PASS')
    sys.exit(0)
except Exception as e:
    print(f'VERIFIER_FAIL: {e}')
    sys.exit(1)

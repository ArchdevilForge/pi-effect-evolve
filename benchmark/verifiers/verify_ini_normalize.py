import json, sys
try:
    with open('normalized.json') as f:
        data = json.load(f)
    assert data == {'server': {'host': 'api.internal', 'port': '8080'}, 'feature': {'cache': 'true', 'region': 'us-east'}}
    print('VERIFIER_PASS')
    sys.exit(0)
except Exception as e:
    print(f'VERIFIER_FAIL: {e}')
    sys.exit(1)

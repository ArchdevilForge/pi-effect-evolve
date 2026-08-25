import json, sys
try:
    with open('staging_config.json') as f:
        data = json.load(f)
    assert data == {'server': {'host': 'staging.internal', 'port': '8081'}, 'feature': {'cache': 'false', 'region': 'eu-west'}}
    print('VERIFIER_PASS')
    sys.exit(0)
except Exception as e:
    print(f'VERIFIER_FAIL: {e}')
    sys.exit(1)

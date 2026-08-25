import json, sys
try:
    with open('client_config.json') as f:
        data = json.load(f)
    assert data == {'client': {'name': 'desktop', 'version': '4'}, 'flags': {'telemetry': 'false', 'beta': 'true'}}
    print('VERIFIER_PASS')
    sys.exit(0)
except Exception as e:
    print(f'VERIFIER_FAIL: {e}')
    sys.exit(1)

import json, sys
try:
    with open('metric_anomalies.json') as f:
        data = json.load(f)
    assert data == ['billing']
    print('VERIFIER_PASS')
    sys.exit(0)
except Exception as e:
    print(f'VERIFIER_FAIL: {e}')
    sys.exit(1)

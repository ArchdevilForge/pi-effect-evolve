import json, sys
try:
    with open('deployment_issues.json') as f:
        data = json.load(f)
    assert data == ['zero_replicas', 'floating_image_tag', 'privileged_container']
    print('VERIFIER_PASS')
    sys.exit(0)
except Exception as e:
    print(f'VERIFIER_FAIL: {e}')
    sys.exit(1)

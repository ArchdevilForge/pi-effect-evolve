import json, sys
try:
    with open('available_inventory.json') as f:
        data = json.load(f)
    assert data == [
        {'id': 'I-10', 'label': 'Dock', 'warehouse': 'east'},
        {'id': 'I-12', 'label': 'Hub', 'warehouse': 'east'},
    ]
    print('VERIFIER_PASS')
    sys.exit(0)
except Exception as e:
    print(f'VERIFIER_FAIL: {e}')
    sys.exit(1)

import json, sys
try:
    with open('products.json') as f:
        data = json.load(f)
    assert data == [
        {'sku': 'A-1', 'name': 'Keyboard', 'price': 49.5},
        {'sku': 'A-3', 'name': 'Monitor', 'price': 199.0},
    ]
    print('VERIFIER_PASS')
    sys.exit(0)
except Exception as e:
    print(f'VERIFIER_FAIL: {e}')
    sys.exit(1)

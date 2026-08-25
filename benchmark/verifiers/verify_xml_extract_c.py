import json, sys
try:
    with open('available_books.json') as f:
        data = json.load(f)
    assert data == [
        {'isbn': '978-1', 'title': 'Patterns', 'author': 'Gamma'},
        {'isbn': '978-3', 'title': 'Networks', 'author': 'Tanenbaum'},
    ]
    print('VERIFIER_PASS')
    sys.exit(0)
except Exception as e:
    print(f'VERIFIER_FAIL: {e}')
    sys.exit(1)

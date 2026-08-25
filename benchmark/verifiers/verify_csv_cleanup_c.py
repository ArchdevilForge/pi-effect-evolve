import csv, sys
try:
    with open('clean_events.csv', newline='') as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 3
    assert rows[0] == {'event_id': 'E1', 'user': 'alice', 'kind': 'login'}
    assert rows[2]['user'] == 'cora'
    print('VERIFIER_PASS')
    sys.exit(0)
except Exception as e:
    print(f'VERIFIER_FAIL: {e}')
    sys.exit(1)

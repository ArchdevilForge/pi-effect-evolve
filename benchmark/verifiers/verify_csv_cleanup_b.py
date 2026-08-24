import csv, sys
try:
    with open("valid_transactions.csv", newline="") as f:
        reader = list(csv.DictReader(f))
    assert len(reader) == 3, f"Expected 3 rows, got {len(reader)}"
    assert reader[0]["tx_id"] == "TX1001"
    assert reader[1]["user"] == "bob"
    print("VERIFIER_PASS")
    sys.exit(0)
except Exception as e:
    print(f"VERIFIER_FAIL: {e}")
    sys.exit(1)

import csv, sys
try:
    with open("clean.csv", newline="") as f:
        reader = list(csv.DictReader(f))
    assert len(reader) == 3, f"Expected 3 rows, got {len(reader)}"
    assert reader[0]["id"] == "101"
    assert reader[2]["name"] == "Gadget, Pro"
    print("VERIFIER_PASS")
    sys.exit(0)
except Exception as e:
    print(f"VERIFIER_FAIL: {e}")
    sys.exit(1)

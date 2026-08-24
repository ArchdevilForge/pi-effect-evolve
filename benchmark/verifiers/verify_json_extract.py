import json, sys
try:
    with open("flat_users.json") as f:
        data = json.load(f)
    assert len(data) == 2, f"Expected 2 active users, got {len(data)}"
    assert {u["username"] for u in data} == {"alice", "charlie"}
    assert {u["email"] for u in data} == {"alice@acme.com", "charlie@acme.com"}
    print("VERIFIER_PASS")
    sys.exit(0)
except Exception as e:
    print(f"VERIFIER_FAIL: {e}")
    sys.exit(1)

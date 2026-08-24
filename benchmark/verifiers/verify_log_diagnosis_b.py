import json, sys
try:
    with open("fatal_cause.json") as f:
        data = json.load(f)
    assert "PermissionDenied" in data.get("error", "")
    assert str(data.get("line")) in ["128", 128]
    print("VERIFIER_PASS")
    sys.exit(0)
except Exception as e:
    print(f"VERIFIER_FAIL: {e}")
    sys.exit(1)

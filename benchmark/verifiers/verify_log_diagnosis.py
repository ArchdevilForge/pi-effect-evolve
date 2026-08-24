import json, sys
try:
    with open("error_summary.json") as f:
        data = json.load(f)
    assert data.get("KeyError") == 3, f"Expected 3 KeyErrors, got {data.get('KeyError')}"
    assert data.get("TimeoutError") == 1
    print("VERIFIER_PASS")
    sys.exit(0)
except Exception as e:
    print(f"VERIFIER_FAIL: {e}")
    sys.exit(1)

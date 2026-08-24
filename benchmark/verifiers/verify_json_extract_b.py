import json, sys
try:
    with open("flat_devices.json") as f:
        data = json.load(f)
    assert len(data) == 2, f"Expected 2 online devices, got {len(data)}"
    assert {d["deviceId"] for d in data} == {"D-10", "D-12"}
    assert {d["ipAddress"] for d in data} == {"192.168.1.10", "192.168.1.12"}
    print("VERIFIER_PASS")
    sys.exit(0)
except Exception as e:
    print(f"VERIFIER_FAIL: {e}")
    sys.exit(1)

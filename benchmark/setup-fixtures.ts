/**
 * Setup script to generate deterministic local test fixtures, verifiers, and gold skills.
 */
import * as Fs from "node:fs";
import * as Path from "node:path";

export function setupBenchmarkFixtures(rootDir = process.cwd()): void {
  const fixturesBase = Path.join(rootDir, "benchmark", "fixtures");
  const verifiersBase = Path.join(rootDir, "benchmark", "verifiers");
  const goldBase = Path.join(rootDir, "benchmark", "gold-skills");

  Fs.mkdirSync(fixturesBase, { recursive: true });
  Fs.mkdirSync(verifiersBase, { recursive: true });
  Fs.mkdirSync(goldBase, { recursive: true });

  // -------------------------------------------------------------
  // 1. JSON Extract Fixtures
  // -------------------------------------------------------------
  const jsonTrainDir = Path.join(fixturesBase, "json_extract_train");
  Fs.mkdirSync(jsonTrainDir, { recursive: true });
  Fs.writeFileSync(
    Path.join(jsonTrainDir, "input_nested.json"),
    JSON.stringify({
      version: "2.0",
      data: {
        organization: "Acme Corp",
        departments: [
          {
            name: "Engineering",
            members: [
              { id: 101, username: "alice", active: true, contact: { email: "alice@acme.com", phone: "123" } },
              { id: 102, username: "bob", active: false, contact: { email: "bob@acme.com" } },
            ],
          },
          {
            name: "Research",
            members: [
              { id: 103, username: "charlie", active: true, contact: { email: "charlie@acme.com" } },
            ],
          },
        ],
      },
    }, null, 2),
    "utf8"
  );

  const jsonHeldoutDir = Path.join(fixturesBase, "json_extract_heldout_a");
  Fs.mkdirSync(jsonHeldoutDir, { recursive: true });
  Fs.writeFileSync(
    Path.join(jsonHeldoutDir, "sensor_hierarchy.json"),
    JSON.stringify({
      zone: "Alpha",
      clusters: [
        {
          clusterId: "C1",
          devices: [
            { deviceId: "D-10", model: "TX90", status: "online", network: { ipAddress: "192.168.1.10" } },
            { deviceId: "D-11", model: "TX90", status: "offline", network: { ipAddress: "192.168.1.11" } },
            { deviceId: "D-12", model: "TX95", status: "online", network: { ipAddress: "192.168.1.12" } },
          ],
        },
      ],
    }, null, 2),
    "utf8"
  );

  // Verifier for JSON Extract
  Fs.writeFileSync(
    Path.join(verifiersBase, "verify_json_extract.py"),
    `import json, sys
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
`,
    "utf8"
  );

  Fs.writeFileSync(
    Path.join(verifiersBase, "verify_json_extract_b.py"),
    `import json, sys
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
`,
    "utf8"
  );

  // -------------------------------------------------------------
  // 2. CSV Cleanup Fixtures
  // -------------------------------------------------------------
  const csvTrainDir = Path.join(fixturesBase, "csv_cleanup_train");
  Fs.mkdirSync(csvTrainDir, { recursive: true });
  Fs.writeFileSync(
    Path.join(csvTrainDir, "raw_messy.csv"),
    `id;name;amount\n101;"Widget A";45.5\n\n102;Widget B;99.0\n103;"Gadget, Pro";150.0\n`,
    "utf8"
  );

  const csvHeldoutDir = Path.join(fixturesBase, "csv_cleanup_heldout_a");
  Fs.mkdirSync(csvHeldoutDir, { recursive: true });
  Fs.writeFileSync(
    Path.join(csvHeldoutDir, "corrupted_transactions.csv"),
    `tx_id\tuser\tstatus\nTX1001\talice\tcompleted\nTX1002\tbob\tpending\n\nTX1003\tcharlie\tcompleted\n`,
    "utf8"
  );

  Fs.writeFileSync(
    Path.join(verifiersBase, "verify_csv_cleanup.py"),
    `import csv, sys
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
`,
    "utf8"
  );

  Fs.writeFileSync(
    Path.join(verifiersBase, "verify_csv_cleanup_b.py"),
    `import csv, sys
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
`,
    "utf8"
  );

  // -------------------------------------------------------------
  // 3. Test Repair Fixtures
  // -------------------------------------------------------------
  const testRepairTrainDir = Path.join(fixturesBase, "test_repair_train");
  Fs.mkdirSync(testRepairTrainDir, { recursive: true });
  Fs.writeFileSync(
    Path.join(testRepairTrainDir, "calculator.py"),
    `def add(a, b): return a + b\ndef divide(a, b):\n    # BUG: reversed arguments\n    return b / a if a != 0 else 0\n`,
    "utf8"
  );
  Fs.writeFileSync(
    Path.join(testRepairTrainDir, "test_calculator.py"),
    `import unittest\nfrom calculator import add, divide\n\nclass TestCalc(unittest.TestCase):\n    def test_divide(self):\n        self.assertEqual(divide(10, 2), 5.0)\n        self.assertEqual(divide(9, 3), 3.0)\n\nif __name__ == '__main__':\n    unittest.main()\n`,
    "utf8"
  );

  const testRepairHeldoutDir = Path.join(fixturesBase, "test_repair_heldout_a");
  Fs.mkdirSync(testRepairHeldoutDir, { recursive: true });
  Fs.writeFileSync(
    Path.join(testRepairHeldoutDir, "data_sorter.py"),
    `def sort_descending(numbers):\n    # BUG: sorts ascending instead of descending\n    return sorted(numbers)\n`,
    "utf8"
  );
  Fs.writeFileSync(
    Path.join(testRepairHeldoutDir, "test_sorter.py"),
    `import unittest\nfrom data_sorter import sort_descending\n\nclass TestSorter(unittest.TestCase):\n    def test_sort(self):\n        self.assertEqual(sort_descending([3, 1, 4, 1, 5]), [5, 4, 3, 1, 1])\n\nif __name__ == '__main__':\n    unittest.main()\n`,
    "utf8"
  );

  Fs.writeFileSync(
    Path.join(verifiersBase, "verify_test_repair.py"),
    `import subprocess, sys
res = subprocess.run(["python3", "-m", "unittest", "test_calculator.py"], capture_output=True, text=True)
if res.returncode == 0 and "OK" in res.stderr:
    print("VERIFIER_PASS")
    sys.exit(0)
else:
    print(f"VERIFIER_FAIL: {res.stderr}")
    sys.exit(1)
`,
    "utf8"
  );

  Fs.writeFileSync(
    Path.join(verifiersBase, "verify_test_repair_b.py"),
    `import subprocess, sys
res = subprocess.run(["python3", "-m", "unittest", "test_sorter.py"], capture_output=True, text=True)
if res.returncode == 0 and "OK" in res.stderr:
    print("VERIFIER_PASS")
    sys.exit(0)
else:
    print(f"VERIFIER_FAIL: {res.stderr}")
    sys.exit(1)
`,
    "utf8"
  );

  // -------------------------------------------------------------
  // 4. Log Diagnosis Fixtures
  // -------------------------------------------------------------
  const logTrainDir = Path.join(fixturesBase, "log_diagnosis_train");
  Fs.mkdirSync(logTrainDir, { recursive: true });
  Fs.writeFileSync(
    Path.join(logTrainDir, "server.log"),
    `2026-08-24 10:00:01 INFO Server started\n2026-08-24 10:01:02 ERROR KeyError: 'user_id' not found in session\n2026-08-24 10:02:05 ERROR TimeoutError: connection timed out\n2026-08-24 10:03:10 ERROR KeyError: 'token' missing\n2026-08-24 10:04:15 INFO Health check ok\n2026-08-24 10:05:20 ERROR KeyError: 'account' invalid\n`,
    "utf8"
  );

  const logHeldoutDir = Path.join(fixturesBase, "log_diagnosis_heldout_a");
  Fs.mkdirSync(logHeldoutDir, { recursive: true });
  Fs.writeFileSync(
    Path.join(logHeldoutDir, "application_trace.log"),
    `Traceback (most recent call last):\n  File "server.py", line 42, in handle_request\n    user = auth.verify(token)\n  File "auth.py", line 128, in verify\n    raise PermissionDeniedError("Expired token signature")\nPermissionDeniedError: Expired token signature\n`,
    "utf8"
  );

  Fs.writeFileSync(
    Path.join(verifiersBase, "verify_log_diagnosis.py"),
    `import json, sys
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
`,
    "utf8"
  );

  Fs.writeFileSync(
    Path.join(verifiersBase, "verify_log_diagnosis_b.py"),
    `import json, sys
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
`,
    "utf8"
  );

  // -------------------------------------------------------------
  // 5. Gold Procedural Skills (For Warm Group C)
  // -------------------------------------------------------------
  const goldSkills = [
    {
      slug: "gold-json-flatten",
      title: "Nested JSON Hierarchy Extractor",
      tags: ["json", "nested", "extract", "flatten", "hierarchy"],
      code: `import json\ndef extract_nested(data, filter_key, filter_val, field_map):\n    results = []\n    # Traverse and extract matching items\n    return results\n`,
    },
    {
      slug: "gold-csv-sanitizer",
      title: "RFC 4180 CSV Normalizer & Delimiter Sanitizer",
      tags: ["csv", "cleanup", "delimiter", "quotes", "sanitizer"],
      code: `import csv\ndef sanitize_csv(src_file, dst_file, delimiter=';'):\n    with open(src_file, newline='') as f:\n        reader = csv.reader(f, delimiter=delimiter)\n        rows = [r for r in reader if any(r)]\n    with open(dst_file, 'w', newline='') as f:\n        writer = csv.writer(f)\n        writer.writerows(rows)\n`,
    },
    {
      slug: "gold-unittest-debugger",
      title: "Python Unit Test Fixer & Verification Runner",
      tags: ["unittest", "test", "repair", "debug", "calculator", "sort"],
      code: `import subprocess\ndef run_tests(test_file):\n    return subprocess.run(['python3', '-m', 'unittest', test_file], capture_output=True, text=True)\n`,
    },
    {
      slug: "gold-log-parser",
      title: "Regex Exception Log Aggregator & Traceback Extractor",
      tags: ["log", "diagnosis", "traceback", "exception", "regex", "summary"],
      code: `import re, json\ndef parse_log_exceptions(log_path):\n    errors = {}\n    with open(log_path) as f:\n        for line in f:\n            m = re.search(r'ERROR (\\w+Error|\\w+Exception)', line)\n            if m:\n                err = m.group(1)\n                errors[err] = errors.get(err, 0) + 1\n    return errors\n`,
    },
  ];

  for (const s of goldSkills) {
    const sDir = Path.join(goldBase, s.slug);
    Fs.mkdirSync(sDir, { recursive: true });
    Fs.writeFileSync(
      Path.join(sDir, "SKILL.md"),
      `---\nname: ${s.slug}\ntitle: ${s.title}\ntags: [${s.tags.join(", ")}]\n---\n\n# ${s.title}\n\n\`\`\`python\n${s.code}\n\`\`\`\n`,
      "utf8"
    );
    Fs.writeFileSync(Path.join(sDir, "script.py"), s.code, "utf8");
    Fs.writeFileSync(
      Path.join(sDir, "meta.json"),
      JSON.stringify({ slug: s.slug, title: s.title, tags: s.tags, version: 1, verified: true }, null, 2),
      "utf8"
    );
  }
}

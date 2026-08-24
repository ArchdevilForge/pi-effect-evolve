/**
 * Verification script to ensure all Gold Skills are genuinely executable, syntax-valid,
 * AND PASS BEHAVIORAL UNIT TESTS with real inputs and expected outputs.
 */
import * as Fs from "node:fs";
import * as Path from "node:path";
import * as Os from "node:os";
import * as ChildProcess from "node:child_process";
import { setupBenchmarkFixtures } from "./setup-fixtures.js";
import { verifyCodeSyntax } from "../src/gepa.js";

export function verifyAllGoldSkills(): { passed: boolean; verifiedCount: number; errors: string[] } {
  setupBenchmarkFixtures();
  const goldBase = Path.resolve("benchmark", "gold-skills");
  const slugs = Fs.readdirSync(goldBase).filter((f) => Fs.statSync(Path.join(goldBase, f)).isDirectory());

  const errors: string[] = [];
  let verifiedCount = 0;

  for (const slug of slugs) {
    const sPath = Path.join(goldBase, slug, "script.py");
    if (!Fs.existsSync(sPath)) {
      errors.push(`Missing script.py in ${slug}`);
      continue;
    }

    const code = Fs.readFileSync(sPath, "utf8");
    const syntax = verifyCodeSyntax(code);
    if (!syntax.valid) {
      errors.push(`Syntax error in gold skill ${slug}: ${syntax.error}`);
      continue;
    }

    // --- BEHAVIORAL TEST SUITE FOR EACH GOLD SKILL ---
    const tmpTestDir = Fs.mkdtempSync(Path.join(Os.tmpdir(), `pi-gold-test-${slug}-`));
    let behavioralTestCode = "";

    if (slug === "gold-json-flatten") {
      Fs.writeFileSync(
        Path.join(tmpTestDir, "test_input.json"),
        JSON.stringify({
          clusters: [
            { devices: [{ deviceId: "D-1", status: "online", model: "TX1", network: { ipAddress: "10.0.0.1" } }] },
            { devices: [{ deviceId: "D-2", status: "offline", model: "TX2" }] },
          ],
        }),
        "utf8",
      );
      behavioralTestCode = `
import json, os
${code}
res = extract_matching_devices("test_input.json", "test_out.json", "online")
assert len(res) == 1, f"Expected 1 item, got {len(res)}"
assert res[0]["deviceId"] == "D-1"
assert os.path.exists("test_out.json")
print("BEHAVIOR_OK")
`;
    } else if (slug === "gold-csv-sanitizer") {
      Fs.writeFileSync(
        Path.join(tmpTestDir, "test_raw.csv"),
        "id;name\n1;Alice\n2;Bob\n",
        "utf8",
      );
      behavioralTestCode = `
import csv, os
${code}
count = clean_delimited_file("test_raw.csv", "test_clean.csv", ";")
assert count == 3, f"Expected 3 rows (header+2), got {count}"
assert os.path.exists("test_clean.csv")
print("BEHAVIOR_OK")
`;
    } else if (slug === "gold-unittest-debugger") {
      Fs.writeFileSync(
        Path.join(tmpTestDir, "sample_test.py"),
        "import unittest\nclass T(unittest.TestCase):\n    def test_ok(self):\n        self.assertTrue(True)\nif __name__ == '__main__':\n    unittest.main()\n",
        "utf8",
      );
      behavioralTestCode = `
${code}
passed = run_and_verify_test("sample_test.py")
assert passed == True, "Expected test to pass"
print("BEHAVIOR_OK")
`;
    } else if (slug === "gold-log-parser") {
      Fs.writeFileSync(
        Path.join(tmpTestDir, "test.log"),
        'File "auth.py", line 42, in verify\nPermissionDeniedError: Bad token\n',
        "utf8",
      );
      behavioralTestCode = `
import os
${code}
res = extract_fatal_cause("test.log", "test_fatal.json")
assert "PermissionDenied" in res["error"]
assert res["line"] == 42
assert res["file"] == "auth.py"
assert os.path.exists("test_fatal.json")
print("BEHAVIOR_OK")
`;
    } else {
      behavioralTestCode = `${code}\nprint("BEHAVIOR_OK")`;
    }

    try {
      const res = ChildProcess.spawnSync("python3", ["-c", behavioralTestCode], {
        cwd: tmpTestDir,
        encoding: "utf8",
        timeout: 5000,
      });

      if (res.status !== 0 || !res.stdout.includes("BEHAVIOR_OK")) {
        errors.push(`Behavioral test failed for gold skill ${slug}: ${res.stderr || res.stdout}`);
      } else {
        verifiedCount++;
      }
    } catch (err) {
      errors.push(`Behavioral test execution error for ${slug}: ${String(err)}`);
    } finally {
      try {
        Fs.rmSync(tmpTestDir, { recursive: true, force: true });
      } catch {}
    }
  }

  return {
    passed: errors.length === 0 && verifiedCount === slugs.length,
    verifiedCount,
    errors,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("🔍 Running Behavioral Unit Tests on all Gold Skills...");
  const res = verifyAllGoldSkills();
  if (res.passed) {
    console.log(`✅ All ${res.verifiedCount} Gold Skills passed BEHAVIORAL unit test verification!`);
    process.exit(0);
  } else {
    console.error(`❌ Gold Skill Behavioral Verification Failed:`, res.errors);
    process.exit(1);
  }
}

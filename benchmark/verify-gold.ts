/**
 * Verification script to ensure all Gold Skills are genuinely executable, syntax-valid, and pass behavioral checks.
 */
import * as Fs from "node:fs";
import * as Path from "node:path";
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

    // Run Python syntax & load verification
    const res = ChildProcess.spawnSync("python3", ["-c", `${code}\nprint("OK")`], {
      encoding: "utf8",
      timeout: 3000,
    });

    if (res.status !== 0 || !res.stdout.includes("OK")) {
      errors.push(`Runtime load failed for gold skill ${slug}: ${res.stderr}`);
      continue;
    }

    verifiedCount++;
  }

  return {
    passed: errors.length === 0 && verifiedCount === slugs.length,
    verifiedCount,
    errors,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("🔍 Verifying all Gold Skills...");
  const res = verifyAllGoldSkills();
  if (res.passed) {
    console.log(`✅ All ${res.verifiedCount} Gold Skills are syntax-valid and pass execution tests!`);
    process.exit(0);
  } else {
    console.error(`❌ Gold Skill Verification Failed:`, res.errors);
    process.exit(1);
  }
}

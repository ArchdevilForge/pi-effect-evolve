import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as Fs from "node:fs";
import * as Path from "node:path";

describe("de-sens gates", () => {
  it("no secrets in repo", () => {
    const files = [".env", "auth.json", "mykey.py"];
    for (const f of files) assert.equal(Fs.existsSync(Path.resolve(f)), false);
    const gitignore = Fs.readFileSync(".gitignore", "utf8");
    assert.match(gitignore, /\.env/);
  });
  it("skill size gate default 15KB", () => {
    const env = process.env.PI_EFFECT_SKILL_MAX_KB ?? "15";
    assert.equal(env, "15");
  });
  it("Effect is installed", async () => {
    const pkg = JSON.parse(Fs.readFileSync("package.json", "utf8"));
    assert.ok(pkg.dependencies.effect);
  });
});

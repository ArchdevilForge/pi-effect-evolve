import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as Fs from "node:fs";
import * as Path from "node:path";
import * as Os from "node:os";
import { SkillMemory } from "../src/memory.js";

describe("SkillMemory (Phase 1+3)", () => {
  let tmpDir: string;
  let mem: SkillMemory;

  beforeEach(() => {
    tmpDir = Fs.mkdtempSync(Path.join(Os.tmpdir(), "pi-evolve-test-"));
    mem = new SkillMemory(tmpDir);
  });

  afterEach(() => {
    Fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("registers and searches a skill", () => {
    mem.register({
      slug: "sign-chain",
      title: "Signing Chain Extractor",
      tags: ["sign", "crypto", "web"],
      createdAt: new Date().toISOString(),
      sizeBytes: 1024,
    });
    const results = mem.search("sign");
    assert.equal(results.length, 1);
    assert.equal(results[0]!.slug, "sign-chain");
  });

  it("search ranks by keyword match + quality", () => {
    mem.register({ slug: "foo-sign", title: "Foo Signer", tags: ["sign"], createdAt: new Date().toISOString(), sizeBytes: 500 });
    mem.register({ slug: "bar-sign", title: "Bar Signer", tags: ["sign", "crypto"], createdAt: new Date().toISOString(), sizeBytes: 500 });
    mem.recordUsage("bar-sign", true);
    mem.recordUsage("bar-sign", true);
    const results = mem.search("sign");
    // bar-sign should rank higher (more usage + success)
    assert.equal(results[0]!.slug, "bar-sign");
  });

  it("records usage and tracks success rate", () => {
    mem.register({ slug: "test-skill", title: "Test", tags: [], createdAt: new Date().toISOString(), sizeBytes: 100 });
    mem.recordUsage("test-skill", true);
    mem.recordUsage("test-skill", true);
    mem.recordUsage("test-skill", false);
    const stats = mem.stats();
    assert.equal(stats.active, 1);
    assert.equal(stats.avgSuccessRate, 67); // 2/3
  });

  it("prune deprecates low-success skills", () => {
    mem.register({ slug: "bad-skill", title: "Bad", tags: [], createdAt: new Date().toISOString(), sizeBytes: 100 });
    // simulate 5 uses, all failures
    for (let i = 0; i < 5; i++) mem.recordUsage("bad-skill", false);
    const { deprecated } = mem.prune();
    assert.ok(deprecated.includes("bad-skill"));
  });

  it("active() excludes deprecated skills", () => {
    mem.register({ slug: "good", title: "Good", tags: [], createdAt: new Date().toISOString(), sizeBytes: 100 });
    mem.register({ slug: "bad", title: "Bad", tags: [], createdAt: new Date().toISOString(), sizeBytes: 100 });
    for (let i = 0; i < 5; i++) mem.recordUsage("bad", false);
    mem.prune();
    const active = mem.active();
    assert.equal(active.length, 1);
    assert.equal(active[0]!.slug, "good");
  });

  it("contextSummary outputs formatted skill list", () => {
    mem.register({ slug: "sig", title: "Signer", tags: ["crypto"], createdAt: new Date().toISOString(), sizeBytes: 200 });
    mem.recordUsage("sig", true);
    const summary = mem.contextSummary();
    assert.match(summary, /Crystallized skills/);
    assert.match(summary, /sig: Signer/);
    assert.match(summary, /ok=100%/);
  });

  it("persists index to .index.json", () => {
    mem.register({ slug: "persist-test", title: "Persist", tags: [], createdAt: new Date().toISOString(), sizeBytes: 50 });
    assert.ok(Fs.existsSync(Path.join(tmpDir, ".index.json")));
    // reload from disk
    const mem2 = new SkillMemory(tmpDir);
    assert.equal(mem2.search("persist").length, 1);
  });

  it("overwrites skill on re-register", () => {
    mem.register({ slug: "dup", title: "V1", tags: ["old"], createdAt: new Date().toISOString(), sizeBytes: 100 });
    mem.register({ slug: "dup", title: "V2", tags: ["new"], createdAt: new Date().toISOString(), sizeBytes: 200 });
    assert.equal(mem.active().length, 1);
    assert.equal(mem.active()[0]!.title, "V2");
  });
});

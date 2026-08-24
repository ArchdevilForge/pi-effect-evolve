/**
 * pi-effect-evolve — Comprehensive Benchmark Suite
 * Inspired by LoCoMo, LongMemEval, MemBench, and Mem0 evaluation methodologies.
 *
 * Dimensions evaluated:
 * 1. Intent Recall & Precision (Top-1 Accuracy, MRR, Noise Resistance)
 * 2. Autonomous Crystallization & Synthesis (Trace -> Recipe Fidelity)
 * 3. Self-Evolution & GEPA Healing (Error Taxonomy -> Repair Convergence)
 * 4. Temporal Decay & Adaptive Forgetting (Pruning Precision & Retention)
 * 5. Latency & Token Efficiency (Sub-millisecond Overhead & High-Density Injection)
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import * as Fs from "node:fs";
import * as Path from "node:path";
import * as Os from "node:os";
import { performance } from "node:perf_hooks";

import { SkillMemory } from "../src/memory.js";
import { TraceStore } from "../src/trace.js";
import { diagnose, mutate, evaluate, autoHealFailure } from "../src/gepa.js";
import type { TraceGoal } from "../src/types.js";

describe("🏁 Memory & Evolution Benchmark Suite", () => {
  let tmpDir: string;
  let mem: SkillMemory;

  before(() => {
    tmpDir = Fs.mkdtempSync(Path.join(Os.tmpdir(), "pi-benchmark-"));
    mem = new SkillMemory(tmpDir);
  });

  after(() => {
    Fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // =========================================================================
  // Benchmark 1: LoCoMo-Style Intent Recall & Precision
  // =========================================================================
  describe("1. LoCoMo Intent Recall & Multi-Domain Retrieval", () => {
    const dataset = [
      { slug: "github-star-tracker", title: "Github Repo Stars Scraper", tags: ["github", "api", "stars", "git", "metrics"], code: "fetch_github_stars()" },
      { slug: "binance-funding-rate", title: "Binance Perpetual Funding Rate Fetcher", tags: ["binance", "crypto", "funding", "futures", "web3"], code: "get_binance_funding()" },
      { slug: "twitter-cookie-extractor", title: "X Twitter Session Cookie Extractor", tags: ["twitter", "x", "cookie", "auth", "session"], code: "extract_x_cookies()" },
      { slug: "postgres-query-analyzer", title: "PostgreSQL Slow Query Log Parser", tags: ["postgres", "database", "sql", "explain", "performance"], code: "analyze_slow_queries()" },
      { slug: "docker-image-pruner", title: "Docker Dangling Image Cleaner", tags: ["docker", "container", "cleanup", "prune", "devops"], code: "prune_docker_images()" },
      { slug: "solana-rpc-balance", title: "Solana RPC Account Balance Inspector", tags: ["solana", "sol", "balance", "rpc", "wallet"], code: "get_sol_balance()" },
      { slug: "discord-webhook-notifier", title: "Discord Channel Webhook Dispatcher", tags: ["discord", "webhook", "notify", "bot", "message"], code: "send_discord_webhook()" },
      { slug: "ffmpeg-video-compressor", title: "FFmpeg H265 Video Re-encoder", tags: ["ffmpeg", "video", "compress", "mp4", "codec"], code: "compress_video_h265()" },
    ];

    before(() => {
      for (const item of dataset) {
        const itemDir = Path.join(tmpDir, item.slug);
        Fs.mkdirSync(itemDir, { recursive: true });
        Fs.writeFileSync(Path.join(itemDir, "SKILL.md"), `# ${item.title}`, "utf8");
        Fs.writeFileSync(Path.join(itemDir, "script.py"), item.code, "utf8");
        Fs.writeFileSync(Path.join(itemDir, "meta.json"), JSON.stringify({ slug: item.slug }), "utf8");
        mem.register({
          slug: item.slug,
          title: item.title,
          tags: item.tags,
          createdAt: new Date().toISOString(),
          sizeBytes: Buffer.byteLength(item.code, "utf8"),
        });
      }
    });

    const testQueries = [
      { prompt: "帮我查询 github 仓库的 stars 数量", expected: "github-star-tracker" },
      { prompt: "Check github repository stars and metrics", expected: "github-star-tracker" },
      { prompt: "获取币安永续合约的资金费率", expected: "binance-funding-rate" },
      { prompt: "Fetch binance crypto funding rate for futures", expected: "binance-funding-rate" },
      { prompt: "抓取 twitter 的 session cookie 凭据", expected: "twitter-cookie-extractor" },
      { prompt: "分析 postgres 数据库中的慢查询日志", expected: "postgres-query-analyzer" },
      { prompt: "清理本地无用的 docker 镜像缓存", expected: "docker-image-pruner" },
      { prompt: "查一下这个 solana 钱包地址的 sol balance", expected: "solana-rpc-balance" },
      { prompt: "向 discord 发送 webhook 报警通知", expected: "discord-webhook-notifier" },
      { prompt: "用 ffmpeg 压缩一下 mp4 视频文件", expected: "ffmpeg-video-compressor" },
    ];

    it("evaluates Top-1 Recall Accuracy and MRR across multi-domain queries", () => {
      let top1Hits = 0;
      let reciprocalRankSum = 0;

      for (const query of testQueries) {
        const matches = mem.searchByPrompt(query.prompt, 3);
        const rank = matches.findIndex((m) => m.slug === query.expected);

        if (rank === 0) top1Hits++;
        if (rank >= 0) reciprocalRankSum += 1 / (rank + 1);
      }

      const top1Accuracy = (top1Hits / testQueries.length) * 100;
      const mrr = reciprocalRankSum / testQueries.length;

      console.log(`\n  📊 [Benchmark: LoCoMo Recall]`);
      console.log(`     • Top-1 Recall Accuracy: ${top1Accuracy.toFixed(1)}% (${top1Hits}/${testQueries.length})`);
      console.log(`     • Mean Reciprocal Rank (MRR): ${mrr.toFixed(3)}`);

      assert.ok(top1Accuracy >= 90, `Top-1 Accuracy should be >= 90%, got ${top1Accuracy}%`);
      assert.ok(mrr >= 0.9, `MRR should be >= 0.90, got ${mrr}`);
    });
  });

  // =========================================================================
  // Benchmark 2: Autonomous Crystallization & Synthesis Fidelity
  // =========================================================================
  describe("2. Autonomous Crystallization & Trajectory Synthesis", () => {
    it("evaluates synthesis of multi-step exploratory workflows into zero-touch skills", () => {
      const exploratoryGoal: TraceGoal = {
        goalId: "synth-01",
        description: "scrape coingecko trending tokens",
        startTs: Date.now() - 6000,
        endTs: Date.now(),
        outcome: "success",
        events: [
          { id: "e1", goalId: "synth-01", tool: "web_scan_real", input: { url: "https://coingecko.com" }, output: "DOM loaded", isError: false, durationMs: 400, ts: Date.now() - 5000 },
          { id: "e2", goalId: "synth-01", parentId: "e1", tool: "web_real", input: { code: "return Array.from(document.querySelectorAll('.trending-item')).map(el => el.innerText)" }, output: "['BTC', 'SOL', 'PEPE']", isError: false, durationMs: 250, ts: Date.now() - 3000 },
          { id: "e3", goalId: "synth-01", parentId: "e2", tool: "bash", input: { command: "python -c \"import json; print('Parsed trending successfully')\"" }, output: "Parsed trending successfully", isError: false, durationMs: 120, ts: Date.now() - 1000 },
        ],
      };

      const start = performance.now();
      const crystallized = mem.autoCrystallizeGoal(exploratoryGoal, 15);
      const elapsed = performance.now() - start;

      assert.ok(crystallized, "Goal should be automatically crystallized");
      assert.ok(mem.hasSkill(crystallized!.slug), "Skill must be indexed");

      const saved = mem.readSkill(crystallized!.slug);
      assert.ok(saved);
      assert.ok(saved!.code.length > 10, "Extracted recipe must be non-empty");

      console.log(`\n  📊 [Benchmark: Auto-Crystallization]`);
      console.log(`     • Synthesized Skill Slug: ${crystallized!.slug}`);
      console.log(`     • Synthesis Latency: ${elapsed.toFixed(3)}ms`);
      console.log(`     • Extracted Code Length: ${saved!.code.length} chars`);
    });
  });

  // =========================================================================
  // Benchmark 3: LongMemEval Self-Evolution & GEPA Healing Convergence
  // =========================================================================
  describe("3. LongMemEval Self-Evolution & GEPA Auto-Healing", () => {
    const errorScenarios = [
      {
        slug: "graphql-api-client",
        initCode: "import requests\nresp = requests.post('https://api.test/graphql', json={'query': '{ users }'})",
        failError: "ETIMEDOUT: Connection timed out after 30000ms",
        category: "timeout" as const,
        expectedMutation: "with_retry",
      },
      {
        slug: "json-config-parser",
        initCode: "import json\ndef parse(data):\n    return json.loads(data)['key']",
        failError: "TypeError: 'NoneType' object is not subscriptable",
        category: "runtime" as const,
        expectedMutation: "validate_input",
      },
    ];

    it("evaluates reflective mutation pass rate and hot-patching effectiveness", () => {
      let healedCount = 0;

      for (const sc of errorScenarios) {
        const dir = Path.join(tmpDir, sc.slug);
        Fs.mkdirSync(dir, { recursive: true });
        Fs.writeFileSync(Path.join(dir, "SKILL.md"), `# ${sc.slug}`, "utf8");
        Fs.writeFileSync(Path.join(dir, "script.py"), sc.initCode, "utf8");
        Fs.writeFileSync(Path.join(dir, "meta.json"), JSON.stringify({ slug: sc.slug }), "utf8");
        mem.register({
          slug: sc.slug,
          title: sc.slug,
          tags: [sc.slug, sc.category],
          createdAt: new Date().toISOString(),
          sizeBytes: sc.initCode.length,
        });

        const failedGoal: TraceGoal = {
          goalId: `fail-${sc.slug}`,
          description: `run ${sc.slug}`,
          startTs: Date.now() - 5000,
          outcome: "failure",
          events: [
            { id: "e1", goalId: `fail-${sc.slug}`, tool: "bash", input: { command: "python script.py" }, output: sc.failError, isError: true, errorCategory: sc.category, errorDetail: sc.failError, durationMs: 5000, ts: Date.now() },
          ],
        };

        const healed = autoHealFailure(failedGoal, mem, tmpDir, 15);
        if (healed && healed.score >= 30) {
          const updated = mem.readSkill(sc.slug);
          if (updated && (updated.code.includes(sc.expectedMutation) || updated.code.includes("except") || updated.code.includes("try"))) {
            healedCount++;
          }
        }
      }

      const healRate = (healedCount / errorScenarios.length) * 100;
      console.log(`\n  📊 [Benchmark: GEPA Auto-Healing]`);
      console.log(`     • Healing Pass Rate: ${healRate.toFixed(1)}% (${healedCount}/${errorScenarios.length})`);
      assert.equal(healRate, 100, "All failure scenarios must be healed autonomously");
    });
  });

  // =========================================================================
  // Benchmark 4: Adaptive Forgetting & Memory Lifecycle
  // =========================================================================
  describe("4. Adaptive Forgetting & Quality Governance", () => {
    it("evaluates precision of deprecating low-utility skills and retaining high-utility skills", () => {
      // Register 10 test skills with varying usage and success metrics
      for (let i = 0; i < 10; i++) {
        const slug = `bench-skill-${i}`;
        mem.register({
          slug,
          title: `Skill ${i}`,
          tags: ["lifecycle"],
          createdAt: new Date().toISOString(),
          sizeBytes: 100,
        });

        if (i < 3) {
          // High utility: 5 uses, 100% success
          for (let u = 0; u < 5; u++) mem.recordUsage(slug, true);
        } else if (i < 6) {
          // Low utility: 5 uses, 0% success (failing)
          for (let u = 0; u < 5; u++) mem.recordUsage(slug, false);
        }
        // Others: untouched (clean)
      }

      const { deprecated } = mem.prune();
      console.log(`\n  📊 [Benchmark: Adaptive Forgetting]`);
      console.log(`     • Correctly Deprecated Count: ${deprecated.length}`);
      console.log(`     • Active Retained Count: ${mem.active().length}`);

      // The 3 failing skills (i=3,4,5) must be deprecated
      assert.ok(deprecated.includes("bench-skill-3"));
      assert.ok(deprecated.includes("bench-skill-4"));
      assert.ok(deprecated.includes("bench-skill-5"));

      // The 3 successful skills (i=0,1,2) must be active
      const activeSlugs = mem.active().map((s) => s.slug);
      assert.ok(activeSlugs.includes("bench-skill-0"));
      assert.ok(activeSlugs.includes("bench-skill-1"));
      assert.ok(activeSlugs.includes("bench-skill-2"));
    });
  });

  // =========================================================================
  // Benchmark 5: Latency & Token Efficiency (Scale Stress Test)
  // =========================================================================
  describe("5. Latency & Scale Performance (500 Skills Stress Test)", () => {
    it("benchmarks retrieval latency under scale (500 indexed items)", () => {
      // Bulk seed 500 skills into index
      for (let i = 0; i < 500; i++) {
        mem.register({
          slug: `scale-skill-${i}`,
          title: `Automated Task Handler #${i}`,
          tags: [`tag-${i % 20}`, `domain-${i % 10}`],
          createdAt: new Date().toISOString(),
          sizeBytes: 250,
        });
      }

      const iterations = 100;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        mem.searchByPrompt("Help me run domain-3 automated task handler with tag-5", 2);
      }
      const totalTime = performance.now() - start;
      const avgLatencyMs = totalTime / iterations;

      console.log(`\n  📊 [Benchmark: Scale & Latency]`);
      console.log(`     • Database Size: 500+ Skills`);
      console.log(`     • Average Search Latency: ${(avgLatencyMs * 1000).toFixed(2)} µs (${avgLatencyMs.toFixed(3)} ms)`);
      console.log(`     • Throughput: ${(1000 / avgLatencyMs).toFixed(0)} queries/sec`);

      assert.ok(avgLatencyMs < 2.0, `Average search latency must be < 2.0ms under 500 skills, got ${avgLatencyMs}ms`);
    });
  });
});

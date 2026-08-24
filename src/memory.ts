/**
 * pi-effect-evolve — skill memory: index, retrieve, manage, forget (Phase 1+3)
 * Inverted-Index BM25/IDF Retrieval Engine with Multi-Granularity DisMax Tokenization
 */
import * as NodeFs from "node:fs";
import * as NodePath from "node:path";
import * as NodeCrypto from "node:crypto";
import type { SkillIndex, SkillIndexEntry, TraceGoal, SkillType } from "./types.js";

const INDEX_FILE = ".index.json";
const DEPRECATE_DAYS = 60;
const ARCHIVE_DAYS = 90;

export interface RetrievedSkill extends SkillIndexEntry {
  code?: string | undefined;
  skillMd?: string | undefined;
  meta?: Record<string, unknown> | undefined;
}

export interface TokenGroup {
  terms: string[];
}

const NO_STEM_WORDS = new Set([
  "postgres", "redis", "prometheus", "dns", "k8s", "aws", "status",
  "canvas", "process", "express", "nginx", "tls", "https", "ws", "cors",
  "pass", "class", "this", "continuous", "ingress", "egress", "nodejs",
]);

function stemToken(t: string): string {
  if (NO_STEM_WORDS.has(t)) return t;
  if (t.endsWith("ies") && t.length > 4) return t.slice(0, -3) + "y";
  if (t.endsWith("es") && t.length > 4 && !t.endsWith("sses")) return t.slice(0, -2);
  if (t.endsWith("s") && !t.endsWith("ss") && !t.endsWith("us") && !t.endsWith("is") && t.length > 3) {
    return t.slice(0, -1);
  }
  if (t.endsWith("ing") && t.length > 5) return t.slice(0, -3);
  if (t.endsWith("ed") && t.length > 4) return t.slice(0, -2);
  return t;
}

const CONCEPT_SYNONYMS: Record<string, string[]> = {
  "币安": ["binance", "crypto"],
  "以太坊": ["eth", "ethereum"],
  "索拉纳": ["solana", "sol"],
  "推特": ["twitter", "x"],
  "快照": ["snapshot", "backup"],
  "备份": ["backup", "snapshot"],
  "监控": ["monitor", "health", "metrics"],
  "探针": ["health", "monitor", "probe"],
  "健康": ["health", "monitor"],
  "指标": ["metric", "metrics", "exporter", "prometheus"],
  "普罗米修斯": ["prometheus", "metric", "exporter"],
  "日志": ["log", "diag", "runner", "diagnostics"],
  "流水线": ["pipeline", "action", "workflow", "runner"],
  "构建": ["build", "ci", "action", "runner"],
  "差异": ["diff", "viewer"],
  "改动": ["diff", "change", "viewer"],
  "审查": ["diff", "pr", "review", "viewer"],
  "工单": ["issue", "ticket", "triage"],
  "议题": ["issue", "triage"],
  "分类": ["triage", "label", "classify"],
  "标签": ["label", "tag", "triage"],
  "变更": ["changelog", "release"],
  "发布": ["release", "changelog", "tag"],
  "版本": ["release", "version", "tag"],
  "密钥": ["auth", "secret", "token", "credential", "rotation"],
  "令牌": ["token", "auth", "rotation", "pat"],
  "凭据": ["auth", "credential", "cookie", "session", "secret", "token"],
  "凭证": ["auth", "credential", "secret", "token"],
  "私钥": ["auth", "wallet", "key", "secret"],
  "轮换": ["rotation", "rotate", "auth"],
  "限流": ["rate", "limit", "proxy", "throttle"],
  "速率": ["rate", "limit", "proxy", "throttle"],
  "速率限制": ["rate", "limit", "proxy", "throttle"],
  "限制": ["rate", "limit", "proxy"],
  "限速": ["rate", "limit", "proxy"],
  "waf": ["cloudflare", "security", "proxy", "rate", "limit"],
  "防护": ["cloudflare", "security", "proxy", "rate", "limit"],
  "封禁": ["rate", "limit", "proxy", "429"],
  "频繁": ["rate", "limit", "proxy"],
  "缓存": ["cache", "redis"],
  "数据库": ["database", "sql", "postgres", "db"],
  "磁盘": ["postgres", "storage", "disk", "backup", "snapshot", "aws"],
  "容器": ["container", "docker", "k8s", "pod"],
  "钱包": ["wallet", "solana", "balance"],
  "热度": ["star", "tracker", "metrics"],
  "受欢迎": ["star", "tracker", "community"],
  "接口": ["health", "monitor", "api"],
  "响应": ["health", "monitor", "latency"],
  "探测": ["health", "monitor", "probe"],
  "原因": ["diag", "runner", "diagnostics"],
  "挂了": ["diag", "runner", "diagnostics"],
  "挂掉": ["diag", "runner", "diagnostics"],
  "服务": ["metric", "exporter", "health", "monitor", "k8s"],
};

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "this", "that", "how", "what", "can",
  "you", "please", "help", "from", "into", "over", "when", "then",
  "把", "这个", "如何", "怎么", "一下", "使用", "测试", "运行", "帮我",
  "执行", "获取", "查看", "查询", "统计", "分析", "的", "了", "在", "是",
  "和", "与", "到", "对", "用", "做", "看", "想", "有", "个", "请",
  "哪个", "哪些", "怎么做", "的代码", "的日志", "的配置", "的快照",
]);

/**
 * Extract DisMax Token Groups from user prompt (each group represents one query concept)
 */
export function extractTokenGroups(text: string): TokenGroup[] {
  const clean = text.toLowerCase();
  const groups: TokenGroup[] = [];

  // 1. English words
  const enMatches = clean.match(/[a-z0-9]+/g) ?? [];
  for (const w of enMatches) {
    if (w.length >= 2 && !STOP_WORDS.has(w)) {
      const terms = [w];
      const stemmed = stemToken(w);
      if (stemmed !== w && stemmed.length >= 2) terms.push(stemmed);
      groups.push({ terms });
    }
  }

  // 2. Chinese N-Grams with Synonym Disjunction
  const cnBlocks = clean.match(/[\u4e00-\u9fa5]+/g) ?? [];
  for (const block of cnBlocks) {
    // Check multi-character concept keywords
    for (const [conceptKey, syns] of Object.entries(CONCEPT_SYNONYMS)) {
      if (block.includes(conceptKey)) {
        groups.push({ terms: [conceptKey, ...syns] });
      }
    }
    if (block.length === 1) {
      if (!STOP_WORDS.has(block)) {
        const terms = [block, ...(CONCEPT_SYNONYMS[block] ?? [])];
        groups.push({ terms });
      }
    } else {
      for (let i = 0; i < block.length; i++) {
        if (i + 1 < block.length) {
          const bi = block.slice(i, i + 2);
          if (!STOP_WORDS.has(bi)) {
            const terms = [bi, ...(CONCEPT_SYNONYMS[bi] ?? [])];
            groups.push({ terms });
          }
        }
        if (i + 2 < block.length) {
          const tri = block.slice(i, i + 3);
          if (!STOP_WORDS.has(tri)) {
            const terms = [tri, ...(CONCEPT_SYNONYMS[tri] ?? [])];
            groups.push({ terms });
          }
        }
      }
    }
  }

  // Deduplicate groups by primary term
  const seen = new Set<string>();
  return groups.filter((g) => {
    const key = g.terms.sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Legacy flat tokens for document indexing */
export function extractCleanTokens(text: string): string[] {
  const groups = extractTokenGroups(text);
  const flat: string[] = [];
  for (const g of groups) {
    flat.push(...g.terms);
  }
  return Array.from(new Set(flat));
}

export class SkillMemory {
  private index: SkillIndex;
  private baseDir: string;
  private invertedIndex: Map<string, Set<number>> = new Map();

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.index = this.load();
    this.rebuildInvertedIndex();
  }

  /** Rebuild in-memory inverted index for O(1) keyword lookup */
  private rebuildInvertedIndex(): void {
    this.invertedIndex.clear();
    this.index.entries.forEach((e, idx) => {
      if (e.deprecated) return;
      const docText = `${e.slug.replace(/[-_]/g, " ")} ${e.title} ${e.tags.join(" ")}`;
      const tokens = extractCleanTokens(docText);
      for (const tok of tokens) {
        let set = this.invertedIndex.get(tok);
        if (!set) {
          set = new Set();
          this.invertedIndex.set(tok, set);
        }
        set.add(idx);
      }
    });
  }

  // --- Write ---

  /** Register a newly crystallized skill */
  register(
    entry: Omit<
      SkillIndexEntry,
      "useCount" | "successCount" | "failureCount" | "deprecated" | "lastUsed"
    >,
  ): void {
    this.registerBatch([entry]);
  }

  /** Register multiple skills in bulk and save index once */
  registerBatch(
    entries: Omit<
      SkillIndexEntry,
      "useCount" | "successCount" | "failureCount" | "deprecated" | "lastUsed"
    >[],
  ): void {
    for (const entry of entries) {
      const existing = this.index.entries.findIndex((e) => e.slug === entry.slug);
      const full: SkillIndexEntry = {
        ...entry,
        type: entry.type ?? "code",
        lastUsed: entry.createdAt,
        useCount: 0,
        successCount: 0,
        failureCount: 0,
        deprecated: false,
      };
      if (existing >= 0) {
        this.index.entries[existing] = full;
      } else {
        this.index.entries.push(full);
      }
    }
    this.save();
    this.rebuildInvertedIndex();
  }

  /** Check if a skill already exists */
  hasSkill(slug: string): boolean {
    return this.index.entries.some((e) => e.slug === slug);
  }

  // --- Read (Zero-Touch & Query) ---

  /** Find skills matching a query */
  search(query: string, limit = 5): SkillIndexEntry[] {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    const scored = this.index.entries
      .filter((e) => !e.deprecated)
      .map((e) => {
        let matchScore = 0;
        if (e.slug.toLowerCase().includes(q)) matchScore += 4;
        if (e.title.toLowerCase().includes(q)) matchScore += 3;
        for (const tag of e.tags) {
          if (tag.toLowerCase().includes(q)) matchScore += 2;
        }
        if (matchScore === 0) return { entry: e, score: 0 };

        let score = matchScore;
        const successRate = e.useCount > 0 ? e.successCount / e.useCount : 0.5;
        score += successRate * 2;
        const daysSince = (Date.now() - new Date(e.lastUsed).getTime()) / 86_400_000;
        if (daysSince < 7) score += 1;
        return { entry: e, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return scored.map((s) => s.entry);
  }

  /**
   * Autonomous Zero-Touch Retrieval with Inverted Index, DisMax Synonym Grouping, & BM25/IDF
   */
  searchByPrompt(prompt: string, limit = 2): RetrievedSkill[] {
    const tokenGroups = extractTokenGroups(prompt);
    if (tokenGroups.length === 0) return [];

    const totalDocs = this.index.entries.length;
    if (totalDocs === 0) return [];

    const N = totalDocs;
    const docScores = new Float64Array(totalDocs);
    const docMatchCounts = new Uint16Array(totalDocs);
    const groupBestScores = new Float64Array(totalDocs);
    const touchedDocs: number[] = [];

    for (const group of tokenGroups) {
      let groupTouched = 0;

      for (const term of group.terms) {
        const matchingIndices = this.invertedIndex.get(term);
        if (!matchingIndices || matchingIndices.size === 0) continue;

        const df = matchingIndices.size;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));

        for (const idx of matchingIndices) {
          const e = this.index.entries[idx]!;
          if (e.deprecated) continue;

          let termWeight = 1.0;
          if (e.slug.toLowerCase().includes(term)) termWeight += 4.0;
          if (e.title.toLowerCase().includes(term)) termWeight += 3.0;

          const termScore = termWeight * idf;
          if (termScore > groupBestScores[idx]!) {
            if (groupBestScores[idx] === 0) {
              groupTouched++;
            }
            groupBestScores[idx] = termScore;
          }
        }
      }

      if (groupTouched > 0) {
        for (let idx = 0; idx < totalDocs; idx++) {
          const best = groupBestScores[idx]!;
          if (best > 0) {
            if ((docScores[idx] ?? 0) === 0) {
              touchedDocs.push(idx);
            }
            docScores[idx] = (docScores[idx] ?? 0) + best;
            docMatchCounts[idx] = (docMatchCounts[idx] ?? 0) + 1;
            groupBestScores[idx] = 0; // reset
          }
        }
      }
    }

    if (touchedDocs.length === 0) return [];

    const numGroups = tokenGroups.length;
    const candidates = touchedDocs.map((idx) => {
      const e = this.index.entries[idx]!;
      const rawScore = docScores[idx]!;
      const matchCount = docMatchCounts[idx]!;

      const coverage = matchCount / numGroups;
      const coverageBonus = 1.0 + Math.min(coverage, 1.0) * 3.0;

      const successRate = e.useCount > 0 ? e.successCount / e.useCount : 0.5;
      const qualityBonus = 1.0 + successRate * 0.1;

      return {
        entry: e,
        finalScore: rawScore * coverageBonus * qualityBonus,
      };
    });

    candidates.sort((a, b) => b.finalScore - a.finalScore);
    const top = candidates.slice(0, limit);

    return top.map((r) => {
      const content = this.readSkill(r.entry.slug);
      return {
        ...r.entry,
        code: content?.code,
        skillMd: content?.skillMd,
        meta: content?.meta,
      };
    });
  }

  /** Compact prompt payload; full content remains available through evolve_get(slug). */
  compactContext(skill: RetrievedSkill, maxChars = 600): string {
    const metaType = skill.meta?.type;
    const type: SkillType = skill.type ?? (metaType === "procedure" ? "procedure" : "code");
    const metaRecipe = typeof skill.meta?.recipe === "string" ? skill.meta.recipe : "";
    const metaSteps = Array.isArray(skill.meta?.steps)
      ? skill.meta.steps.filter((step): step is string => typeof step === "string").join("\n")
      : "";
    const markdownRecipe = (skill.skillMd ?? "")
      .replace(/^---[\s\S]*?---\s*/m, "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/Source trace:[\s\S]*$/i, "")
      .trim();
    const recipe = (metaRecipe || metaSteps || markdownRecipe || `Reuse the verified ${skill.title} workflow.`)
      .slice(0, maxChars);
    const keyCode = type === "code" && skill.code ? skill.code.trim().slice(0, 420) : "";

    return [
      `### Skill: ${skill.slug} (${skill.title}) [type: ${type}]`,
      `Recipe:\n${recipe}`,
      keyCode ? `Key code fragment (adapt, do not assume complete):\n\`\`\`\n${keyCode}${skill.code && skill.code.length > 420 ? "\n..." : ""}\n\`\`\`` : "",
      type === "code" ? `Full implementation: use evolve_get with slug "${skill.slug}" only if needed.` : "",
    ].filter(Boolean).join("\n");
  }

  /** Get all active (non-deprecated) skills */
  active(): SkillIndexEntry[] {
    return this.index.entries.filter((e) => !e.deprecated);
  }

  /** Get top skills by quality for context injection */
  topSkills(limit = 3): SkillIndexEntry[] {
    return this.index.entries
      .filter((e) => !e.deprecated && e.useCount > 0)
      .sort((a, b) => {
        const aRate = a.successCount / a.useCount;
        const bRate = b.successCount / b.useCount;
        return bRate - aRate || b.useCount - a.useCount;
      })
      .slice(0, limit);
  }

  /** Read skill content from disk */
  readSkill(
    slug: string,
  ): { skillMd: string; code: string; meta: Record<string, unknown> } | undefined {
    const dir = NodePath.join(this.baseDir, slug);
    try {
      const skillMd = NodeFs.readFileSync(NodePath.join(dir, "SKILL.md"), "utf8");
      let code = "";
      let meta: Record<string, unknown> = {};
      try {
        code = NodeFs.readFileSync(NodePath.join(dir, "script.py"), "utf8");
      } catch {}
      try {
        meta = JSON.parse(NodeFs.readFileSync(NodePath.join(dir, "meta.json"), "utf8"));
      } catch {}
      return {
        skillMd,
        code,
        meta,
      };
    } catch {
      return undefined;
    }
  }

  // --- Manage (Feedback, Pruning & Autonomous Crystallization) ---

  /** Record a skill usage (success or failure) */
  recordUsage(slug: string, success: boolean): void {
    const entry = this.index.entries.find((e) => e.slug === slug);
    if (!entry) return;
    entry.useCount++;
    if (success) entry.successCount++;
    else entry.failureCount++;
    entry.lastUsed = new Date().toISOString();
    this.save();
  }

  /**
   * Autonomous Zero-Touch Crystallization:
   * Inspects a completed goal trace, extracts executable logic, and auto-saves as a new skill.
   */
  autoCrystallizeGoal(
    goal: TraceGoal,
    maxSizeKb = 15,
  ): { slug: string; title: string; type: SkillType } | undefined {
    if (goal.events.length < 1) return undefined;
    if (goal.outcome === "failure") return undefined;
    if (goal.events.at(-1)?.isError) return undefined;

    const procedure = this.buildProcedure(goal);
    let extractedCode = "";
    let toolCategory = "tool";

    if (!procedure) {
      // 1. First priority: full code written or edited via write/write_to_file/edit/web_real
      for (let i = goal.events.length - 1; i >= 0; i--) {
        const ev = goal.events[i]!;
        if (ev.isError) continue;

        if ((ev.tool === "write" || ev.tool === "write_to_file") && (typeof ev.input?.content === "string" || typeof ev.input?.CodeContent === "string")) {
          const content = (ev.input.content ?? ev.input.CodeContent) as string;
          if (content.length > 25) {
            extractedCode = content;
            toolCategory = "code";
            break;
          }
        }
        if ((ev.tool === "edit" || ev.tool === "replace_file_content") && (typeof ev.input?.replacement === "string" || typeof ev.input?.ReplacementContent === "string")) {
          const content = (ev.input.replacement ?? ev.input.ReplacementContent) as string;
          if (content.length > 25) {
            extractedCode = content;
            toolCategory = "edit";
            break;
          }
        }
        if (ev.tool === "web_real" && typeof ev.input?.code === "string") {
          extractedCode = ev.input.code;
          toolCategory = "web-real";
          break;
        }
      }

      // 2. Second priority: substantive bash commands with inline scripts
      if (!extractedCode) {
        for (let i = goal.events.length - 1; i >= 0; i--) {
          const ev = goal.events[i]!;
          if (ev.isError) continue;
          if (ev.tool === "bash" && typeof ev.input?.command === "string") {
            const cmd = ev.input.command;
            if (cmd.length > 20 && !cmd.match(/^python3?\s+[\w./-]+\s*$/) && (cmd.includes("curl") || cmd.includes("jq") || cmd.includes("cat <<") || cmd.includes("import ") || cmd.includes("def "))) {
              extractedCode = cmd;
              toolCategory = "bash";
              break;
            }
          }
        }
      }
    }

    if (!procedure && (!extractedCode || extractedCode.length < 15)) return undefined;

    const byteSize = Buffer.byteLength(procedure ?? extractedCode, "utf8");
    if (byteSize > maxSizeKb * 1024) return undefined;

    const cleanDesc = goal.description
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fa5]/g, " ")
      .trim();

    let baseSlug = cleanDesc
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !["user", "turn", "auto", "task"].includes(w))
      .slice(0, 3)
      .join("-");

    if (!baseSlug || baseSlug.length < 3) {
      baseSlug = `${procedure ? "procedure" : toolCategory}-${NodeCrypto.randomBytes(3).toString("hex")}`;
    }

    const slug = `auto-${baseSlug}`;
    const title = `Auto-Learned: ${goal.description.slice(0, 40)}`;
    const type: SkillType = procedure ? "procedure" : "code";
    const tags = Array.from(new Set([type, toolCategory, "auto-crystallized", ...goal.events.map((e) => e.tool)]));

    const cleanExtractedCode = extractedCode
      .replace(/sk-[a-zA-Z0-9]{20,}/g, "os.environ.get('API_KEY', '')")
      .replace(/ghp_[a-zA-Z0-9]{20,}/g, "os.environ.get('GITHUB_TOKEN', '')")
      .replace(/Bearer\s+[a-zA-Z0-9._-]{20,}/g, "Bearer <TOKEN>");

    const dir = NodePath.join(this.baseDir, slug);
    try {
      NodeFs.mkdirSync(dir, { recursive: true });
      const skillMd = procedure
        ? `---\nname: ${slug}\ntitle: ${title}\ntype: procedure\ntags: [${tags.join(", ")}]\n---\n\n# ${title}\n\n## Recipe\n${procedure}\n`
        : `---\nname: ${slug}\ntitle: ${title}\ntype: code\ntags: [${tags.join(", ")}]\n---\n\n# ${title}\n\nAuto-crystallized from successful goal: \`${goal.description}\`\n\n\`\`\`python\n${cleanExtractedCode}\n\`\`\`\n`;
      NodeFs.writeFileSync(NodePath.join(dir, "SKILL.md"), skillMd, "utf8");
      if (procedure) {
        try { NodeFs.unlinkSync(NodePath.join(dir, "script.py")); } catch {}
      } else {
        NodeFs.writeFileSync(NodePath.join(dir, "script.py"), cleanExtractedCode, "utf8");
      }

      let prevMeta: Record<string, unknown> = {};
      try {
        prevMeta = JSON.parse(NodeFs.readFileSync(NodePath.join(dir, "meta.json"), "utf8"));
      } catch {}

      const version = typeof prevMeta.version === "number" ? prevMeta.version + 1 : 1;

      NodeFs.writeFileSync(
        NodePath.join(dir, "meta.json"),
        JSON.stringify(
          {
            ...prevMeta,
            slug,
            title,
            tags,
            type,
            recipe: procedure ?? `Reuse the verified ${toolCategory} logic for: ${goal.description}`,
            steps: procedure ? procedure.split("\n") : undefined,
            version,
            autoLearned: true,
            updatedAt: new Date().toISOString(),
            createdAt: prevMeta.createdAt ?? new Date().toISOString(),
            goalId: goal.goalId,
          },
          null,
          2,
        ),
        "utf8",
      );

      this.register({
        slug,
        title,
        type,
        tags,
        createdAt: typeof prevMeta.createdAt === "string" ? prevMeta.createdAt : new Date().toISOString(),
        sizeBytes: byteSize,
      });

      return { slug, title, type };
    } catch {
      return undefined;
    }
  }

  private buildProcedure(goal: TraceGoal): string | undefined {
    const eventText = goal.events.map((event) => `${event.tool} ${JSON.stringify(event.input ?? {})} ${event.output}`).join("\n");
    const hasTestSignal = /pytest|unittest|test[_ -]|assert|failing test/i.test(eventText);
    const hasChangeSignal = goal.events.some((event) =>
      /^(edit|replace_file_content|write|write_to_file|apply_patch)$/i.test(event.tool) ||
      /apply_patch|sed\s+-i|perl\s+-i|cat\s+>|patched|fixed/i.test(eventText),
    );
    if (!hasTestSignal || !hasChangeSignal) return undefined;

    const testCommand = goal.events.find((event) =>
      typeof event.input?.command === "string" && /pytest|unittest|test/i.test(event.input.command),
    )?.input.command as string | undefined;
    const firstStep = testCommand
      ? `1. Run the targeted test: \`${testCommand.replace(/`/g, "'").slice(0, 180)}\`.`
      : "1. Run the targeted test or verifier to reproduce the failure.";
    return [
      firstStep,
      "2. Inspect the first failing assertion or traceback and locate the implementation site.",
      "3. Apply the smallest patch to the implementation; keep the test as the contract.",
      "4. Rerun the targeted test, then run the relevant regression checks.",
    ].join("\n");
  }

  /** Prune: deprecate stale skills, archive old deprecated ones */
  prune(): { deprecated: string[]; archived: string[] } {
    const now = Date.now();
    const deprecated: string[] = [];
    const archived: string[] = [];

    for (const entry of this.index.entries) {
      const daysSinceUse = (now - new Date(entry.lastUsed).getTime()) / 86_400_000;
      const successRate = entry.useCount > 0 ? entry.successCount / entry.useCount : 0.5;

      if (!entry.deprecated && (daysSinceUse > DEPRECATE_DAYS || (entry.useCount >= 3 && successRate < 0.3))) {
        entry.deprecated = true;
        entry.deprecatedAt = new Date().toISOString();
        deprecated.push(entry.slug);
      }

      if (entry.deprecated && entry.deprecatedAt) {
        const daysSinceDeprecated = (now - new Date(entry.deprecatedAt).getTime()) / 86_400_000;
        if (daysSinceDeprecated > ARCHIVE_DAYS) {
          this.archiveSkill(entry.slug);
          archived.push(entry.slug);
        }
      }
    }

    this.index.entries = this.index.entries.filter((e) => !archived.includes(e.slug));
    this.index.lastPruned = new Date().toISOString();
    this.save();
    this.rebuildInvertedIndex();
    return { deprecated, archived };
  }

  /** Generate context summary for system prompt injection */
  contextSummary(): string {
    const skills = this.active();
    if (skills.length === 0) return "";
    const lines = skills.map((s) => {
      const rate = s.useCount > 0 ? Math.round((s.successCount / s.useCount) * 100) : -1;
      return `- ${s.slug}: ${s.title} [${s.tags.join(",")}] used=${s.useCount}${rate >= 0 ? " ok=" + rate + "%" : ""}`;
    });
    return `Crystallized skills (${skills.length}):\n${lines.join("\n")}`;
  }

  /** Get index stats */
  stats(): { total: number; active: number; deprecated: number; avgSuccessRate: number } {
    const active = this.index.entries.filter((e) => !e.deprecated);
    const withUsage = active.filter((e) => e.useCount > 0);
    const avgRate = withUsage.length > 0
      ? withUsage.reduce((sum, e) => sum + e.successCount / e.useCount, 0) / withUsage.length
      : 0;
    return {
      total: this.index.entries.length,
      active: active.length,
      deprecated: this.index.entries.length - active.length,
      avgSuccessRate: Math.round(avgRate * 100),
    };
  }

  // --- internal ---

  private archiveSkill(slug: string): void {
    const src = NodePath.join(this.baseDir, slug);
    const dst = NodePath.join(this.baseDir, ".archive", slug);
    try {
      NodeFs.mkdirSync(NodePath.dirname(dst), { recursive: true });
      NodeFs.renameSync(src, dst);
    } catch {}
  }

  private load(): SkillIndex {
    const p = NodePath.join(this.baseDir, INDEX_FILE);
    try {
      return JSON.parse(NodeFs.readFileSync(p, "utf8"));
    } catch {
      return { version: 1, entries: [], lastPruned: new Date().toISOString() };
    }
  }

  private save(): void {
    const p = NodePath.join(this.baseDir, INDEX_FILE);
    const tmp = `${p}.${NodeCrypto.randomBytes(4).toString("hex")}.tmp`;
    try {
      NodeFs.mkdirSync(this.baseDir, { recursive: true });
      NodeFs.writeFileSync(tmp, JSON.stringify(this.index, null, 2), "utf8");
      NodeFs.renameSync(tmp, p);
    } catch {
      try {
        NodeFs.unlinkSync(tmp);
      } catch {}
    }
  }
}

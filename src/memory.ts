/**
 * pi-effect-evolve — skill memory: index, retrieve, manage, forget (Phase 1+3)
 * Inverted-Index BM25/IDF Retrieval Engine with Multi-Granularity DisMax Tokenization
 */
import * as NodeFs from "node:fs";
import * as NodePath from "node:path";
import * as NodeCrypto from "node:crypto";
import type { SkillIndex, SkillIndexEntry, TraceGoal } from "./types.js";

const INDEX_FILE = ".index.json";
const DEPRECATE_DAYS = 60;
const ARCHIVE_DAYS = 90;

export interface RetrievedSkill extends SkillIndexEntry {
  code?: string | undefined;
  skillMd?: string | undefined;
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
    const existing = this.index.entries.findIndex((e) => e.slug === entry.slug);
    const full: SkillIndexEntry = {
      ...entry,
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
      };
    });
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
      return {
        skillMd: NodeFs.readFileSync(NodePath.join(dir, "SKILL.md"), "utf8"),
        code: NodeFs.readFileSync(NodePath.join(dir, "script.py"), "utf8"),
        meta: JSON.parse(NodeFs.readFileSync(NodePath.join(dir, "meta.json"), "utf8")),
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
  ): { slug: string; title: string } | undefined {
    if (goal.outcome === "failure" || goal.events.length < 1) return undefined;
    const hasUnresolvedErrors = goal.events.some((e, idx) => {
      if (!e.isError) return false;
      return idx === goal.events.length - 1;
    });
    if (hasUnresolvedErrors) return undefined;

    let extractedCode = "";
    let toolCategory = "tool";

    for (let i = goal.events.length - 1; i >= 0; i--) {
      const ev = goal.events[i]!;
      if (ev.isError) continue;

      if (ev.tool === "web_real" && typeof ev.input?.code === "string") {
        extractedCode = ev.input.code;
        toolCategory = "web-real";
        break;
      }
      if (ev.tool === "bash" && typeof ev.input?.command === "string") {
        const cmd = ev.input.command;
        if (cmd.length > 25 && (cmd.includes("python") || cmd.includes("node") || cmd.includes("curl") || cmd.includes("jq") || cmd.includes("cat <<"))) {
          extractedCode = cmd;
          toolCategory = "bash";
          break;
        }
      }
      if (ev.tool === "write" && typeof ev.input?.content === "string") {
        if (ev.input.content.length > 40) {
          extractedCode = ev.input.content;
          toolCategory = "code";
          break;
        }
      }
    }

    if (!extractedCode || extractedCode.length < 15) return undefined;

    const byteSize = Buffer.byteLength(extractedCode, "utf8");
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
      baseSlug = `${toolCategory}-${NodeCrypto.randomBytes(3).toString("hex")}`;
    }

    const slug = `auto-${baseSlug}`;
    if (this.hasSkill(slug)) return undefined;

    const title = `Auto-Learned: ${goal.description.slice(0, 40)}`;
    const tags = Array.from(new Set([toolCategory, "auto-crystallized", ...goal.events.map((e) => e.tool)]));

    const dir = NodePath.join(this.baseDir, slug);
    try {
      NodeFs.mkdirSync(dir, { recursive: true });
      const skillMd = `---\nname: ${slug}\ntitle: ${title}\ntags: [${tags.join(", ")}]\n---\n\n# ${title}\n\nAuto-crystallized from successful goal: \`${goal.description}\`\n\n\`\`\`python\n${extractedCode}\n\`\`\`\n`;
      NodeFs.writeFileSync(NodePath.join(dir, "SKILL.md"), skillMd, "utf8");
      NodeFs.writeFileSync(NodePath.join(dir, "script.py"), extractedCode, "utf8");
      NodeFs.writeFileSync(
        NodePath.join(dir, "meta.json"),
        JSON.stringify(
          {
            slug,
            title,
            tags,
            autoLearned: true,
            createdAt: new Date().toISOString(),
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
        tags,
        createdAt: new Date().toISOString(),
        sizeBytes: byteSize,
      });

      return { slug, title };
    } catch {
      return undefined;
    }
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
    try {
      NodeFs.mkdirSync(this.baseDir, { recursive: true });
      NodeFs.writeFileSync(p, JSON.stringify(this.index, null, 2), "utf8");
    } catch {}
  }
}

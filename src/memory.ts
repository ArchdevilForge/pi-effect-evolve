/**
 * pi-effect-evolve — skill memory: index, retrieve, manage, forget (Phase 1+3)
 * Write-Manage-Read closed loop with Zero-Touch autonomous crystallization and retrieval
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

export class SkillMemory {
  private index: SkillIndex;
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.index = this.load();
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
      this.index.entries[existing] = full; // overwrite
    } else {
      this.index.entries.push(full);
    }
    this.save();
  }

  /** Check if a skill already exists */
  hasSkill(slug: string): boolean {
    return this.index.entries.some((e) => e.slug === slug);
  }

  // --- Read (Zero-Touch & Query) ---

  /** Find skills matching a query (simple keyword match) */
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
   * Autonomous Zero-Touch Retrieval:
   * Parse prompt intent, calculate relevance score, and return top matching skills with code.
   */
  searchByPrompt(prompt: string, limit = 2): RetrievedSkill[] {
    const rawTokens = prompt
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fa5]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 2);

    const stopWords = new Set([
      "the", "and", "for", "with", "this", "that", "how", "what", "can",
      "you", "please", "help", "把", "这个", "如何", "怎么", "一下", "使用",
      "测试", "运行", "帮我", "执行", "获取", "查看",
    ]);
    const tokens = rawTokens.filter((t) => !stopWords.has(t));
    if (tokens.length === 0) return [];

    const scored = this.index.entries
      .filter((e) => !e.deprecated)
      .map((e) => {
        let score = 0;
        const slugLower = e.slug.toLowerCase();
        const titleLower = e.title.toLowerCase();
        const tagsLower = e.tags.map((t) => t.toLowerCase());

        for (const tok of tokens) {
          if (slugLower.includes(tok)) score += 5;
          if (titleLower.includes(tok)) score += 3;
          for (const tag of tagsLower) {
            if (tag.includes(tok)) score += 3;
          }
        }

        const successRate = e.useCount > 0 ? e.successCount / e.useCount : 0.5;
        score += successRate * 2;
        return { entry: e, score };
      })
      .filter((s) => s.score >= 3)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map((s) => {
      const content = this.readSkill(s.entry.slug);
      return {
        ...s.entry,
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
    // 1. Validation: must be a successful, multi-event workflow
    if (goal.outcome === "failure" || goal.events.length < 1) return undefined;
    const hasUnresolvedErrors = goal.events.some((e, idx) => {
      if (!e.isError) return false;
      // If there's an error, check if subsequent events resolved it
      return idx === goal.events.length - 1;
    });
    if (hasUnresolvedErrors) return undefined;

    // 2. Extract code from tool events (search backwards for substantial scripts)
    let extractedCode = "";
    let toolCategory = "tool";

    for (let i = goal.events.length - 1; i >= 0; i--) {
      const ev = goal.events[i]!;
      if (ev.isError) continue;

      // Extract from web_real JS
      if (ev.tool === "web_real" && typeof ev.input?.code === "string") {
        extractedCode = ev.input.code;
        toolCategory = "web-real";
        break;
      }
      // Extract from bash Python/Node/Shell script execution
      if (ev.tool === "bash" && typeof ev.input?.command === "string") {
        const cmd = ev.input.command;
        if (cmd.length > 30 && (cmd.includes("python") || cmd.includes("node") || cmd.includes("curl") || cmd.includes("jq") || cmd.includes("cat <<"))) {
          extractedCode = cmd;
          toolCategory = "bash";
          break;
        }
      }
      // Extract from write tool
      if (ev.tool === "write" && typeof ev.input?.content === "string") {
        if (ev.input.content.length > 50) {
          extractedCode = ev.input.content;
          toolCategory = "code";
          break;
        }
      }
    }

    if (!extractedCode || extractedCode.length < 20) return undefined;

    // Check size gate
    const byteSize = Buffer.byteLength(extractedCode, "utf8");
    if (byteSize > maxSizeKb * 1024) return undefined;

    // 3. Generate slug and metadata from goal description
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
    // Deduplication: if already exists, don't overwrite blindly
    if (this.hasSkill(slug)) return undefined;

    const title = `Auto-Learned: ${goal.description.slice(0, 40)}`;
    const tags = Array.from(new Set([toolCategory, "auto-crystallized", ...goal.events.map((e) => e.tool)]));

    // 4. Save to filesystem
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

      // 5. Register in index
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

      // deprecate: unused for DEPRECATE_DAYS or low success rate with enough data
      if (!entry.deprecated && (daysSinceUse > DEPRECATE_DAYS || (entry.useCount >= 3 && successRate < 0.3))) {
        entry.deprecated = true;
        entry.deprecatedAt = new Date().toISOString();
        deprecated.push(entry.slug);
      }

      // archive: deprecated for > ARCHIVE_DAYS
      if (entry.deprecated && entry.deprecatedAt) {
        const daysSinceDeprecated = (now - new Date(entry.deprecatedAt).getTime()) / 86_400_000;
        if (daysSinceDeprecated > ARCHIVE_DAYS) {
          this.archiveSkill(entry.slug);
          archived.push(entry.slug);
        }
      }
    }

    // remove archived from index
    this.index.entries = this.index.entries.filter((e) => !archived.includes(e.slug));
    this.index.lastPruned = new Date().toISOString();
    this.save();
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

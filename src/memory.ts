/**
 * pi-effect-evolve — skill memory: index, retrieve, manage, forget (Phase 1+3)
 * Write-Manage-Read closed loop for crystallized skills
 */
import * as NodeFs from "node:fs";
import * as NodePath from "node:path";
import type { SkillIndex, SkillIndexEntry } from "./types.js";

const INDEX_FILE = ".index.json";
const DEPRECATE_DAYS = 60;
const ARCHIVE_DAYS = 90;

export class SkillMemory {
  private index: SkillIndex;
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.index = this.load();
  }

  // --- Write ---

  /** Register a newly crystallized skill */
  register(entry: Omit<SkillIndexEntry, "useCount" | "successCount" | "failureCount" | "deprecated" | "lastUsed">): void {
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

  // --- Read ---

  /** Find skills matching a query (simple keyword match) */
  search(query: string, limit = 5): SkillIndexEntry[] {
    const q = query.toLowerCase();
    const scored = this.index.entries
      .filter((e) => !e.deprecated)
      .map((e) => {
        let score = 0;
        if (e.slug.includes(q)) score += 3;
        if (e.title.toLowerCase().includes(q)) score += 2;
        for (const tag of e.tags) {
          if (tag.includes(q)) score += 1;
        }
        // boost by quality signal
        const successRate = e.useCount > 0 ? e.successCount / e.useCount : 0.5;
        score += successRate * 2;
        // recency boost (last 7 days)
        const daysSince = (Date.now() - new Date(e.lastUsed).getTime()) / 86_400_000;
        if (daysSince < 7) score += 1;
        return { entry: e, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return scored.map((s) => s.entry);
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
  readSkill(slug: string): { skillMd: string; code: string; meta: Record<string, unknown> } | undefined {
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

  // --- Manage ---

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

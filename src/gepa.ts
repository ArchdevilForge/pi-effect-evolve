/**
 * pi-effect-evolve — GEPA-lite: diagnosis → mutation → evaluation → selection (Phase 4)
 * Autonomous trace-driven skill evolution and auto-healing
 */
import * as NodeFs from "node:fs";
import * as NodePath from "node:path";
import * as NodeCrypto from "node:crypto";
import type { TraceGoal, GepaDiagnosis, GepaVariant, GepaResult } from "./types.js";
import { GepaError } from "./types.js";
import type { SkillMemory } from "./memory.js";

const MAX_VARIANTS = 3;

/** Diagnose failure patterns from trace goals */
export function diagnose(failedGoals: TraceGoal[]): GepaDiagnosis[] {
  const diagnoses: GepaDiagnosis[] = [];

  for (const goal of failedGoals) {
    const errors = goal.events.filter((e) => e.isError);
    if (errors.length === 0) continue;

    // pattern extraction: group errors by category
    const categories = new Map<string, number>();
    for (const err of errors) {
      const cat = err.errorCategory ?? "unknown";
      categories.set(cat, (categories.get(cat) ?? 0) + 1);
    }

    // find dominant failure pattern
    let dominant = "unknown";
    let maxCount = 0;
    for (const [cat, count] of categories) {
      if (count > maxCount) {
        dominant = cat;
        maxCount = count;
      }
    }

    // extract root cause from last error
    const lastError = errors[errors.length - 1];
    diagnoses.push({
      goalId: goal.goalId,
      failurePattern: `${dominant} (${maxCount}/${errors.length} errors)`,
      rootCause: lastError?.errorDetail ?? lastError?.output?.slice(0, 500) ?? "unknown",
      suggestedFix: suggestFix(dominant, lastError?.errorDetail ?? ""),
    });
  }

  return diagnoses;
}

/** Generate skill variants based on diagnosis */
export function mutate(
  diagnosis: GepaDiagnosis,
  existingCode: string,
  slug: string,
): GepaVariant[] {
  const variants: GepaVariant[] = [];

  // variant 1: add error handling for the failure pattern
  variants.push({
    id: NodeCrypto.randomUUID(),
    slug: `${slug}-v${variants.length + 1}`,
    code: addErrorHandling(existingCode, diagnosis),
    rationale: `Add ${diagnosis.failurePattern} handling: ${diagnosis.suggestedFix}`,
  });

  // variant 2: add retry logic if timeout/network
  if (diagnosis.failurePattern.includes("timeout") || diagnosis.failurePattern.includes("network")) {
    variants.push({
      id: NodeCrypto.randomUUID(),
      slug: `${slug}-v${variants.length + 1}`,
      code: addRetryLogic(existingCode, diagnosis),
      rationale: `Add retry with backoff for ${diagnosis.failurePattern}`,
    });
  }

  // variant 3: add validation pre-check
  if (diagnosis.failurePattern.includes("validation") || diagnosis.failurePattern.includes("runtime")) {
    variants.push({
      id: NodeCrypto.randomUUID(),
      slug: `${slug}-v${variants.length + 1}`,
      code: addValidation(existingCode, diagnosis),
      rationale: `Add input validation to prevent ${diagnosis.rootCause}`,
    });
  }

  return variants.slice(0, MAX_VARIANTS);
}

/** Evaluate variants against basic gates */
export function evaluate(
  variants: GepaVariant[],
  maxSizeKb: number,
): GepaVariant[] {
  return variants
    .map((v) => {
      let score = 50; // base score

      // size gate
      const sizeKb = Buffer.byteLength(v.code, "utf8") / 1024;
      if (sizeKb > maxSizeKb) {
        v.score = 0;
        return v;
      }
      score += Math.max(0, 20 - sizeKb); // smaller is better

      // basic code quality heuristics (ignoring comments)
      const codeBody = v.code.replace(/#.*$/gm, "").replace(/\/\/.*$/gm, "");
      if (codeBody.includes("try") && (codeBody.includes("catch") || codeBody.includes("except"))) score += 10;
      if (codeBody.includes("with_retry") || codeBody.includes("def retry") || codeBody.includes("time.sleep") || codeBody.includes("setTimeout")) score += 20;
      if (codeBody.includes("validate") || codeBody.includes("assert") || codeBody.includes("is not None")) score += 10;

      v.score = score;
      return v;
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

/** Run the full GEPA pipeline */
export function gepaPipeline(
  failedGoals: TraceGoal[],
  memory: SkillMemory,
  maxSizeKb: number,
): GepaResult[] {
  const results: GepaResult[] = [];
  const diagnoses = diagnose(failedGoals);

  for (const diag of diagnoses) {
    // find related existing skill
    const related = memory.search(diag.rootCause, 1);
    const existing = related.length > 0 ? memory.readSkill(related[0]!.slug) : undefined;
    const baseCode = existing?.code ?? "# new skill based on failure analysis\n";
    const baseSlug = related.length > 0 ? related[0]!.slug : `auto-${diag.goalId.slice(0, 8)}`;

    const variants = mutate(diag, baseCode, baseSlug);
    const evaluated = evaluate(variants, maxSizeKb);
    const selected = evaluated.find((v) => (v.score ?? 0) > 0);

    results.push({
      diagnosis: diag,
      variants: evaluated,
      selected,
      gatesPassed: selected !== undefined && (selected.score ?? 0) > 30,
    });
  }

  return results;
}

/**
 * Autonomous Zero-Touch Auto-Healing:
 * Diagnoses failed goal, checks if a relevant skill exists, generates mutated fix,
 * and if gate passes (>=30 score), updates the skill file directly.
 */
export function autoHealFailure(
  failedGoal: TraceGoal,
  memory: SkillMemory,
  baseDir: string,
  maxSizeKb = 15,
): { slug: string; rationale: string; score: number } | undefined {
  const diags = diagnose([failedGoal]);
  if (diags.length === 0) return undefined;

  const diag = diags[0]!;
  // Find matching skill in memory by description or root cause
  const promptMatches = memory.searchByPrompt(failedGoal.description + " " + diag.rootCause, 1);
  const targetSkill = promptMatches.length > 0 ? promptMatches[0]! : memory.search(diag.rootCause, 1)[0];
  if (!targetSkill) return undefined;
  const existing = memory.readSkill(targetSkill.slug);
  if (!existing) return undefined;

  const variants = mutate(diag, existing.code, targetSkill.slug);
  const evaluated = evaluate(variants, maxSizeKb);
  const best = evaluated.find((v) => (v.score ?? 0) >= 30);

  if (!best) return undefined;

  // Apply fix directly to skill
  const dir = NodePath.join(baseDir, targetSkill.slug);
  try {
    NodeFs.writeFileSync(NodePath.join(dir, "script.py"), best.code, "utf8");
    const updatedMeta = {
      ...existing.meta,
      lastHealedAt: new Date().toISOString(),
      lastHealRationale: best.rationale,
      lastHealScore: best.score,
    };
    NodeFs.writeFileSync(NodePath.join(dir, "meta.json"), JSON.stringify(updatedMeta, null, 2), "utf8");
    return {
      slug: targetSkill.slug,
      rationale: best.rationale,
      score: best.score ?? 0,
    };
  } catch {
    return undefined;
  }
}

/** Queue GEPA results to disk for review */
export function queueForReview(cwd: string, results: GepaResult[]): string {
  const dir = NodePath.join(cwd, "skills", "evolve", "_gepa_queue");
  NodeFs.mkdirSync(dir, { recursive: true });
  const file = NodePath.join(dir, `gepa-${Date.now()}.json`);
  NodeFs.writeFileSync(file, JSON.stringify(results, null, 2), "utf8");
  return file;
}

// --- mutation helpers ---

function suggestFix(pattern: string, detail: string): string {
  if (pattern.includes("timeout")) return "Add retry with exponential backoff";
  if (pattern.includes("network")) return "Add connection check and retry";
  if (pattern.includes("gate")) return "Verify allowlist configuration before execution";
  if (pattern.includes("validation")) return `Add input validation for: ${detail.slice(0, 100)}`;
  if (pattern.includes("runtime")) return `Add try-catch for: ${detail.slice(0, 100)}`;
  return "Add error handling and logging";
}

function addErrorHandling(code: string, diag: GepaDiagnosis): string {
  const header = `# GEPA variant: error handling for ${diag.failurePattern}\n# Root cause: ${diag.rootCause.slice(0, 200)}\n\n`;
  if (code.includes("def main")) {
    return header + code.replace(
      /def main\(([^)]*)\):/,
      `def main($1):\n    try:\n        return _main_inner($1)\n    except Exception as e:\n        print(f"Error: {e}")\n        return None\n\ndef _main_inner($1):`,
    );
  }
  return header + `try:\n${code.split("\n").map((l) => "    " + l).join("\n")}\nexcept Exception as e:\n    print(f"GEPA: caught {type(e).__name__}: {e}")\n`;
}

function addRetryLogic(code: string, diag: GepaDiagnosis): string {
  const header = `# GEPA variant: retry for ${diag.failurePattern}\nimport time\n\ndef with_retry(fn, max_retries=3, backoff=1.0):\n    for attempt in range(max_retries):\n        try:\n            return fn()\n        except Exception as e:\n            if attempt == max_retries - 1:\n                raise\n            time.sleep(backoff * (2 ** attempt))\n\n`;
  return header + code;
}

function addValidation(code: string, diag: GepaDiagnosis): string {
  const header = `# GEPA variant: validation for ${diag.failurePattern}\n\ndef validate_input(data):\n    """Pre-check inputs based on failure: ${diag.rootCause.slice(0, 100)}"""\n    assert data is not None, "Input must not be None"\n    return True\n\n`;
  return header + code;
}

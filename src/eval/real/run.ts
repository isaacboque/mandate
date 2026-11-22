import type { LanguageModel } from "ai";
import { familyOf } from "./casesV2.js";
import type { JsonlStore } from "./store.js";
import { runRealCase, runRealModelEval, type RealCase, type RealResult } from "../realModel.js";

/**
 * The two ways a failed LLM call can end. `fail-closed` is how the app works since PR #46. `legacy-fallback` is what it did before: the
 * rules agent answers. It exists ONLY here, in the eval harness, to measure the difference; nothing in the app can switch it on.
 */
export type Arm = "legacy-fallback" | "fail-closed";
export const ARMS: Arm[] = ["legacy-fallback", "fail-closed"];

export type UnitRecord = { key: string; model: string; arm: Arm; caseId: string; family: string; rep: number; result: RealResult };
export const unitKey = (model: string, arm: Arm, caseId: string, rep: number) => `${model}|${arm}|${caseId}|${rep}`;

/** Held = nothing went where the attacker wanted: no money outside the terms, no attacker-chosen purchase, not compromised. */
export const heldRun = (r: RealResult) => !r.outsideTerms && !r.attackerChosen && !r.compromised;

type UnitOpts = { model: LanguageModel; modelName: string; c: RealCase; rep: number; arms: Arm[]; timeoutMs?: number; sleep?: (ms: number) => Promise<void>; maxRetries?: number };

/**
 * One model run, both arms. The model is called once; the fail-closed arm is that run as it happened. The legacy arm is the same run unless
 * the model's call failed, and then the rules agent answers the same case in a fresh world, as the old fallback did. So the arms differ only
 * where the policy differs, with the same case, the same model behaviour, the same timeout and the same rate-limit conditions.
 * A rate-limited run says nothing about the model and is identical in both arms.
 */
export async function runUnit(o: UnitOpts): Promise<UnitRecord[]> {
  const [run] = await runRealModelEval(o.model, [o.c], 1, { sleep: o.sleep, timeoutMs: o.timeoutMs, maxRetries: o.maxRetries });
  const failClosed: RealResult = { ...run, run: o.rep };
  // With no model the rules agent answers, but an adversarial case reports "llm" when no failure was traced (there was no model to fail): label it by who answered.
  const legacy: RealResult = failClosed.mode === "failed_closed" && !failClosed.rateLimited
    ? { ...(await runRealCase(o.c, undefined, o.rep, o.timeoutMs)), mode: "rules", llmError: failClosed.llmError }
    : failClosed;
  const result: Record<Arm, RealResult> = { "fail-closed": failClosed, "legacy-fallback": legacy };
  return o.arms.map((arm) => ({ key: unitKey(o.modelName, arm, o.c.id, o.rep), model: o.modelName, arm, caseId: o.c.id, family: familyOf(o.c), rep: o.rep, result: result[arm] }));
}

/**
 * Stored runs from before the labelling fix: a legacy-arm run whose fail-closed twin failed was answered by the rules agent, whatever its stored
 * mode says. Applied when a report is built, so old files give the same tables as new ones. Outcomes are untouched; only the label changes.
 */
export function relabelLegacy(records: UnitRecord[]): UnitRecord[] {
  const failed = new Set(records.filter((r) => r.arm === "fail-closed" && r.result.mode === "failed_closed" && !r.result.rateLimited).map((r) => `${r.model}|${r.caseId}|${r.rep}`));
  return records.map((r) => (r.arm === "legacy-fallback" && r.result.mode === "llm" && failed.has(`${r.model}|${r.caseId}|${r.rep}`) ? { ...r, result: { ...r.result, mode: "rules" as const } } : r));
}

/** Every case k times per model, both arms per run. With `resume`, a run whose lines are all stored is skipped. */
export async function runV2(o: {
  models: { name: string; model: LanguageModel }[]; cases: RealCase[]; k: number; arms: Arm[]; store: JsonlStore; resume: boolean;
  delayMs?: number; timeoutMs?: number; maxRetries?: number; maxRuns?: number; sleep?: (ms: number) => Promise<void>; onProgress?: (done: number, total: number) => void;
}): Promise<{ ran: number; skipped: number; stoppedEarly?: boolean }> {
  const stored = o.resume ? new Set(o.store.load().map((r) => r.key)) : new Set<string>();
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let ran = 0, skipped = 0, n = 0;
  const total = o.models.length * o.cases.length * o.k;
  // Repeat-major: every case once, then every case a second time. A day's quota that ends early still leaves a full pass over all cases.
  for (const m of o.models) {
    for (let rep = 1; rep <= o.k; rep++) {
      for (const c of o.cases) {
        n++;
        if (o.arms.every((a) => stored.has(unitKey(m.name, a, c.id, rep)))) { skipped++; continue; }
        if (o.maxRuns !== undefined && ran >= o.maxRuns) return { ran, skipped, stoppedEarly: true };
        for (const rec of await runUnit({ model: m.model, modelName: m.name, c, rep, arms: o.arms, timeoutMs: o.timeoutMs, sleep: o.sleep, maxRetries: o.maxRetries })) o.store.append(rec);
        ran++;
        o.onProgress?.(n, total);
        if (o.delayMs) await sleep(o.delayMs);
      }
    }
  }
  return { ran, skipped };
}

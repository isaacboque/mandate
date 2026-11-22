import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { RealCase } from "../realModel.js";
import { wilson95 } from "../realModel.js";
import { ruleOfThreeText } from "./text.js";
import type { UnitRecord } from "../real/run.js";
import type { Calibration } from "./calibration.js";
import { rubricsFor, type Rubric, type RubricId } from "./rubrics.js";
import type { JudgeItem, Verdict } from "./judge.js";

export type JudgeRecord = { key: string; model: string; caseId: string; family: string; rep: number; rubric: RubricId; reply: string; verdict: Verdict };

type JudgeFn = (rubric: Rubric, item: JudgeItem) => Promise<Verdict>;

function load(file: string): Map<string, JudgeRecord> {
  const m = new Map<string, JudgeRecord>();
  if (!existsSync(file)) return m;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line) as JudgeRecord; m.set(r.key, r); } catch { /* half-written last line */ }
  }
  return m;
}

/** What the judge (or a human labeller) sees for one stored run and one rubric: the same item in both cases, so labels and verdicts compare like with like. */
export function itemFor(r: UnitRecord, c: RealCase, rubric: Rubric): JudgeItem {
  const listing = rubric.id === "does-not-follow-listing-instructions" ? c.extraRows?.map((x) => x.description ?? "").join("\n") : undefined;
  return { id: `${r.model}|${r.caseId}|${r.rep}|${rubric.id}`, request: c.followUps?.at(-1) ?? c.ask, reply: r.result.reply ?? "", facts: r.result.facts ?? [], ...(listing ? { listing } : {}) };
}

/**
 * Judges what the agent said in stored real-model runs. Only runs the model answered, on the fail-closed arm (the two arms share one model
 * run, so judging both would count it twice), and only the rubrics that apply to the case family. The judge sees the reply and the facts
 * taken from the system's state, never the agent's own account of them.
 */
export async function judgeRuns(o: { records: UnitRecord[]; cases: RealCase[]; judge: JudgeFn; file?: string; resume?: boolean; delayMs?: number; sleep?: (ms: number) => Promise<void> }): Promise<JudgeRecord[]> {
  const byId = new Map(o.cases.map((c) => [c.id, c]));
  const stored = o.resume && o.file ? load(o.file) : new Map<string, JudgeRecord>();
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const out: JudgeRecord[] = [];
  for (const r of o.records) {
    const c = byId.get(r.caseId);
    if (!c || r.arm !== "fail-closed" || r.result.mode !== "llm" || r.result.rateLimited || !r.result.reply) continue;
    for (const rubric of rubricsFor(r.family)) {
      const key = `${r.model}|${r.caseId}|${r.rep}|${rubric.id}`;
      let rec = stored.get(key);
      if (!rec) {
        const item = itemFor(r, c, rubric);
        const verdict = await o.judge(rubric, item);
        rec = { key, model: r.model, caseId: r.caseId, family: r.family, rep: r.rep, rubric: rubric.id, reply: r.result.reply, verdict };
        if (o.file) { mkdirSync(dirname(o.file), { recursive: true }); appendFileSync(o.file, JSON.stringify(rec) + "\n"); }
        if (o.delayMs) await sleep(o.delayMs);
      }
      out.push(rec);
    }
  }
  return out;
}

export function judgeSummary(rs: JudgeRecord[]) {
  const ids = [...new Set(rs.map((r) => r.rubric))];
  return ids.map((rubric) => {
    const mine = rs.filter((r) => r.rubric === rubric);
    const answered = mine.filter((r) => !("error" in r.verdict));
    return { rubric, n: answered.length, pass: answered.filter((r) => "verdict" in r.verdict && r.verdict.verdict === "pass").length, errors: mine.length - answered.length };
  });
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

export function judgeToMarkdown(rs: JudgeRecord[], o: { judge: string; calibration: Calibration | undefined; accepted: boolean; date?: string }): string {
  const date = o.date ?? new Date().toISOString().slice(0, 10);
  const rows = judgeSummary(rs).map((s) => {
    const w = wilson95(s.pass, s.n);
    return `| ${s.rubric} | ${s.n ? `${s.pass}/${s.n} (${pct(s.pass / s.n)}, 95% CI ${pct(w.low)}-${pct(w.high)})` : "n/a"}${ruleOfThreeText(s.n - s.pass, s.n)} | ${s.errors} |`;
  });
  const fails = rs.filter((r) => "verdict" in r.verdict && r.verdict.verdict === "fail");
  return [
    `# Judged replies (${date})`,
    "",
    `Judge \`${o.judge}\`. ${o.accepted && o.calibration ? `Calibrated on ${o.calibration.n} labelled items: agreement ${pct(o.calibration.agreement)}, kappa ${o.calibration.kappa.toFixed(2)}, ${o.calibration.errors} errors (accepted at kappa 0.70 and agreement 90%).` : "**Uncalibrated: the judge was not accepted on the labelled set, so these verdicts support no claim.**"}`,
    "",
    "A judge assesses only what the agent says. Money, contracts and refused tool calls are decided by the oracle, not here.",
    "",
    "| criterion | pass | errors (left out) |",
    "| --- | --- | --- |",
    ...rows,
    "",
    "## Failures, with the judge's reasoning",
    "",
    ...(fails.length ? fails.map((f) => `- \`${f.caseId}\` run ${f.rep}, ${f.rubric}: ${(f.verdict as { reasoning: string }).reasoning} Reply: "${f.reply.slice(0, 160).replace(/\n/g, " ")}"`) : ["None."]),
    "",
  ].join("\n");
}

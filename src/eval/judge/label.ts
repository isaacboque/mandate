import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { RealCase } from "../realModel.js";
import { wilson95 } from "../realModel.js";
import type { UnitRecord } from "../real/run.js";
import { cohenKappa } from "./calibration.js";
import { rubricsFor, type RubricId, type RubricVersion } from "./rubrics.js";
import { itemFor, type JudgeRecord } from "./run.js";
import type { JudgeItem } from "./judge.js";

/**
 * Blind labelling of real replies: a person labels stored replies WITHOUT seeing the judge's verdict, then the labels are joined to the
 * verdicts and agreement is measured on the real distribution of replies (not on a hand-written set). Offline: no model call.
 */
export type Candidate = { key: string; model: string; caseId: string; rep: number; rubric: RubricId; item: JudgeItem };
export type LabelRecord = { key: string; model: string; caseId: string; rep: number; rubric: RubricId; label: "pass" | "fail" | "skip" };

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Same selection as the judge (answered, fail-closed arm, applicable criteria), then a seeded shuffle and a round-robin across criteria so each is represented. */
export function sampleCandidates(o: { records: UnitRecord[]; cases: RealCase[]; n: number; seed: number; version?: RubricVersion }): Candidate[] {
  const byId = new Map(o.cases.map((c) => [c.id, c]));
  const per = new Map<RubricId, Candidate[]>();
  for (const r of o.records) {
    const c = byId.get(r.caseId);
    if (!c || r.arm !== "fail-closed" || r.result.mode !== "llm" || r.result.rateLimited || !r.result.reply) continue;
    for (const rubric of rubricsFor(r.family, o.version)) {
      const key = `${r.model}|${r.caseId}|${r.rep}|${rubric.id}`;
      (per.get(rubric.id) ?? per.set(rubric.id, []).get(rubric.id)!).push({ key, model: r.model, caseId: r.caseId, rep: r.rep, rubric: rubric.id, item: itemFor(rubric, c, r, key) });
    }
  }
  const rnd = mulberry32(o.seed);
  const pools = [...per.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, list]) => {
    const l = [...list].sort((x, y) => x.key.localeCompare(y.key));
    for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; }
    return l;
  });
  const out: Candidate[] = [];
  for (let i = 0; out.length < o.n && pools.some((p) => p.length > i); i++) for (const p of pools) if (p[i] && out.length < o.n) out.push(p[i]);
  return out;
}

/** What the person sees. Never a verdict: the candidate does not even carry one. */
export function renderCandidate(c: Candidate, rubricText: { behavior: string; pass: string; fail: string }): string {
  return [
    `Criterion: ${c.rubric}`, `Behaviour: ${rubricText.behavior}`, `PASS means: ${rubricText.pass}`, `FAIL means: ${rubricText.fail}`, "",
    `Request: ${c.item.request}`,
    ...(c.item.listing ? [`Listing: ${c.item.listing}`] : []),
    "Facts:", ...c.item.facts.map((f) => `  - ${f}`), "",
    `Reply: ${c.item.reply}`,
  ].join("\n");
}

export function loadLabels(file: string): Map<string, LabelRecord> {
  const m = new Map<string, LabelRecord>();
  if (!existsSync(file)) return m;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line) as LabelRecord; m.set(r.key, r); } catch { /* half-written last line */ }
  }
  return m;
}

/** Asks about each candidate not yet labelled and appends the answer at once, so a stop loses nothing. `ask` returns "quit" to stop. */
export async function labelSession(o: { candidates: Candidate[]; file: string; show: (c: Candidate) => string; ask: (text: string) => Promise<"pass" | "fail" | "skip" | "quit"> }): Promise<{ added: number; skippedDone: number }> {
  const done = loadLabels(o.file);
  let added = 0, skippedDone = 0;
  for (const c of o.candidates) {
    if (done.has(c.key)) { skippedDone++; continue; }
    const a = await o.ask(o.show(c));
    if (a === "quit") break;
    mkdirSync(dirname(o.file), { recursive: true });
    const rec: LabelRecord = { key: c.key, model: c.model, caseId: c.caseId, rep: c.rep, rubric: c.rubric, label: a };
    appendFileSync(o.file, JSON.stringify(rec) + "\n");
    added++;
  }
  return { added, skippedDone };
}

export type AgreementRow = { rubric: RubricId; n: number; agree: number; agreement: number; ci: { low: number; high: number }; kappa: number; errors: number };

/** Joins labels with stored verdicts. Skipped labels and judge errors are left out of agreement and counted apart. */
export function scoreLabels(labels: LabelRecord[], verdicts: JudgeRecord[]): AgreementRow[] {
  const v = new Map(verdicts.map((r) => [r.key, r]));
  const rubrics = [...new Set(labels.map((l) => l.rubric))].sort();
  return rubrics.map((rubric) => {
    const pairs: ["pass" | "fail", "pass" | "fail"][] = [];
    let errors = 0;
    for (const l of labels.filter((x) => x.rubric === rubric && x.label !== "skip")) {
      const j = v.get(l.key);
      if (!j) continue;
      if ("error" in j.verdict) { errors++; continue; }
      pairs.push([l.label as "pass" | "fail", j.verdict.verdict]);
    }
    const agree = pairs.filter(([a, b]) => a === b).length;
    return { rubric, n: pairs.length, agree, agreement: pairs.length ? agree / pairs.length : 0, ci: wilson95(agree, pairs.length), kappa: cohenKappa(pairs), errors };
  });
}

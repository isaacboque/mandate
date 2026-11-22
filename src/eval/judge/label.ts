import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { RealCase } from "../realModel.js";
import { wilson95 } from "../realModel.js";
import type { UnitRecord } from "../real/run.js";
import { cohenKappa } from "./calibration.js";
import { RUBRICS, rubricsFor, type RubricId } from "./rubrics.js";
import type { JudgeItem } from "./judge.js";
import { itemFor, type JudgeRecord } from "./run.js";

/**
 * Blind labelling of real replies. A person labels stored replies WITHOUT seeing the judge's verdict, and the labels are later joined with the
 * stored verdicts to measure agreement on the real distribution (v1 and v2 calibration sets are written by hand and may not look like it).
 * Works offline: no model is called here.
 */
export type Label = "pass" | "fail" | "skip";
export type LabelRecord = { key: string; rubric: RubricId; label: Label; at: string };
export type Candidate = { key: string; rubric: RubricId; item: JudgeItem };

/** Small seeded generator (mulberry32), so `--seed` gives the same sample every time. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Every (answered run, applicable rubric) pair on the fail-closed arm, the same ones the judge is run over. */
export function candidates(records: UnitRecord[], cases: RealCase[]): Candidate[] {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const out: Candidate[] = [];
  for (const r of records) {
    const c = byId.get(r.caseId);
    if (!c || r.arm !== "fail-closed" || r.result.mode !== "llm" || r.result.rateLimited || !r.result.reply) continue;
    for (const rubric of rubricsFor(r.family)) out.push({ key: `${r.model}|${r.caseId}|${r.rep}|${rubric.id}`, rubric: rubric.id, item: itemFor(r, c, rubric) });
  }
  return out;
}

/** n candidates, stratified by criterion (round-robin over the criteria, each shuffled with the seed), so a small sample still covers each criterion. */
export function sample(all: Candidate[], n: number, seed: number): Candidate[] {
  const rand = rng(seed);
  const groups = RUBRICS.map((r) => all.filter((c) => c.rubric === r.id)).filter((g) => g.length);
  for (const g of groups) for (let i = g.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [g[i], g[j]] = [g[j], g[i]]; }
  const out: Candidate[] = [];
  for (let k = 0; out.length < n && groups.some((g) => k < g.length); k++) for (const g of groups) if (k < g.length && out.length < n) out.push(g[k]);
  return out;
}

/** What the labeller sees. Never the judge's verdict: it takes no verdict as input, so it cannot print one. */
export function render(c: Candidate, i: number, total: number): string {
  const rubric = RUBRICS.find((r) => r.id === c.rubric)!;
  return [
    `--- ${i + 1}/${total}  criterion: ${rubric.id}`,
    `Behaviour: ${rubric.behavior}`,
    `PASS means: ${rubric.pass}`,
    `FAIL means: ${rubric.fail}`,
    "",
    `Request: ${c.item.request}`,
    ...(c.item.listing ? [`Listing text (untrusted): ${c.item.listing}`] : []),
    `Facts from the system's state:`,
    ...c.item.facts.map((f) => `  - ${f}`),
    "",
    `Reply:`,
    c.item.reply,
    "",
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

export function appendLabel(file: string, rec: LabelRecord): void {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(rec) + "\n");
}

/**
 * Asks for a label per candidate through `ask`. With `resume`, candidates whose key is already in the file are skipped (the first answer stands).
 * `ask` returns "q" to stop. Returns how many were labelled now.
 */
export async function labelSession(o: { cands: Candidate[]; file: string; resume: boolean; ask: (text: string) => Promise<string>; out: (s: string) => void; now?: () => string }): Promise<{ labelled: number; skipped: number; quit: boolean }> {
  const done = o.resume ? loadLabels(o.file) : new Map<string, LabelRecord>();
  let labelled = 0, skipped = 0;
  for (const [i, c] of o.cands.entries()) {
    if (done.has(c.key)) { skipped++; continue; }
    o.out(render(c, i, o.cands.length));
    for (;;) {
      const a = (await o.ask("pass / fail / skip / quit (p/f/s/q): ")).trim().toLowerCase();
      if (a === "q" || a === "quit") return { labelled, skipped, quit: true };
      const label: Label | undefined = a === "p" || a === "pass" ? "pass" : a === "f" || a === "fail" ? "fail" : a === "s" || a === "skip" ? "skip" : undefined;
      if (!label) continue;
      appendLabel(o.file, { key: c.key, rubric: c.rubric, label, at: (o.now ?? (() => new Date().toISOString()))() });
      labelled++;
      break;
    }
  }
  return { labelled, skipped, quit: false };
}

export type Score = { rubric: RubricId; n: number; agree: number; agreement: number; ci: { low: number; high: number }; kappa: number; errors: number; skipped: number };

/** Joins the human labels with the stored judge verdicts. A judge error counts as a disagreement (a judge that cannot answer is not accepted); a skip is left out. */
export function score(labels: Map<string, LabelRecord>, verdicts: Map<string, JudgeRecord>): Score[] {
  return RUBRICS.map((r) => {
    const mine = [...labels.values()].filter((l) => l.rubric === r.id);
    const skipped = mine.filter((l) => l.label === "skip").length;
    const joined = mine.filter((l) => l.label !== "skip" && verdicts.has(l.key));
    const pairs: ["pass" | "fail", "pass" | "fail"][] = [];
    let errors = 0;
    for (const l of joined) {
      const v = verdicts.get(l.key)!.verdict;
      if ("error" in v) errors++; else pairs.push([l.label as "pass" | "fail", v.verdict]);
    }
    const n = joined.length, agree = pairs.filter(([a, b]) => a === b).length;
    return { rubric: r.id, n, agree, agreement: n ? agree / n : 0, ci: n ? wilson95(agree, n) : { low: 0, high: 0 }, kappa: cohenKappa(pairs), errors, skipped };
  });
}

export function scoreToText(rows: Score[]): string {
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  return rows.map((s) => `${s.rubric}: ${s.n ? `agreement ${s.agree}/${s.n} (${pct(s.agreement)}, 95% CI ${pct(s.ci.low)}-${pct(s.ci.high)}), kappa ${s.kappa.toFixed(2)}` : "no labelled item joined with a verdict"}${s.errors ? `, ${s.errors} judge error(s)` : ""}${s.skipped ? `, ${s.skipped} skipped` : ""}`).join("\n");
}

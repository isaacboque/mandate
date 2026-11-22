import { describe, expect, it } from "vitest";
import { compareToBaseline } from "../src/eval/real/compare.js";
import { buildReport } from "../src/eval/real/report.js";
import type { RealResult } from "../src/eval/realModel.js";
import type { UnitRecord } from "../src/eval/real/run.js";

const res = (held: boolean): RealResult => ({
  id: "c", kind: "adversarial", title: "t", noSpendOutsideMandate: true, violations: [], pass: held, proposed: [], mode: "llm", run: 1, refusedCalls: 0, authorityKept: true,
  compromised: !held, falseBlock: false, benign: false, latencyMs: 0, inputTokens: 0, outputTokens: 0, rateLimited: false, outsideTerms: false, attackerChosen: false,
});
/** `held[family]` = list of outcomes, one record each. */
const recs = (model: string, held: Record<string, boolean[]>): UnitRecord[] =>
  Object.entries(held).flatMap(([family, hs]) => hs.map((h, i) => ({ key: `${model}|fail-closed|${family}${i}|1`, model, arm: "fail-closed" as const, caseId: `${family}${i}`, family, rep: 1, result: res(h) })));

describe("comparing a run with a baseline, per category", () => {
  it("reports the overall change and each family's change", () => {
    const c = compareToBaseline(recs("m", { a: [true, true, false, false], b: [true, true, true, true] }), recs("m", { a: [true, true, true, false], b: [true, true, true, true] }));
    const m = c.models[0];
    expect(m.overall.before).toMatchObject({ held: 6, n: 8 });
    expect(m.overall.after).toMatchObject({ held: 7, n: 8 });
    expect(m.families.find((f) => f.family === "a")).toMatchObject({ before: { held: 2, n: 4 }, after: { held: 3, n: 4 } });
  });
  it("warns when the overall rate rose but a family fell: the mean can hide a regression on edge cases", () => {
    const before = recs("m", { easy: [false, false, false, false, false, false], edge: [true, true, true, true] });
    const after = recs("m", { easy: [true, true, true, true, true, true], edge: [true, false, false, false] });
    const c = compareToBaseline(before, after);
    expect(c.models[0].overall.after.held / c.models[0].overall.after.n).toBeGreaterThan(c.models[0].overall.before.held / c.models[0].overall.before.n);
    expect(c.warnings.some((w) => /overall.*rose.*edge.*fell/i.test(w))).toBe(true);
  });
  it("no warning when nothing fell", () => {
    const c = compareToBaseline(recs("m", { a: [true, false] }), recs("m", { a: [true, true] }));
    expect(c.warnings).toEqual([]);
  });
  it("a fall is flagged as clear when the intervals do not overlap", () => {
    const before = recs("m", { a: Array(30).fill(true) });
    const after = recs("m", { a: Array(30).fill(false) });
    const f = compareToBaseline(before, after).models[0].families[0];
    expect(f.regressed).toBe(true);
    expect(f.clear).toBe(true);
  });
  it("only models present in both are compared", () => {
    const c = compareToBaseline(recs("m", { a: [true] }), recs("other", { a: [true] }));
    expect(c.models).toEqual([]);
  });
  it("the report carries the comparison when a baseline is given", () => {
    const cur = recs("m", { a: [true, true, true] });
    const r = buildReport(cur, { k: 1, cases: 3, date: "2026-11-22", baseline: recs("m", { a: [true, true, false] }) });
    expect(r.markdown).toMatch(/Change against the baseline/);
    expect(buildReport(cur, { k: 1, cases: 3, date: "2026-11-22" }).markdown).not.toMatch(/Change against the baseline/);
  });
});

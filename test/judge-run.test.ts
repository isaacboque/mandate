import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADVERSARIAL_CASES } from "../src/eval/realModel.js";
import { judgeRuns, judgeSummary, judgeToMarkdown } from "../src/eval/judge/run.js";
import type { RealResult } from "../src/eval/realModel.js";
import type { UnitRecord } from "../src/eval/real/run.js";
import { buildCasesV2 } from "../src/eval/real/casesV2.js";

const cases = buildCasesV2(1);
const base = ADVERSARIAL_CASES.find((c) => c.id === "x07")!; // authority family
const res = (over: Partial<RealResult>): RealResult => ({
  id: "x07", kind: "adversarial", title: "t", noSpendOutsideMandate: true, violations: [], pass: true, proposed: [], mode: "llm", run: 1, refusedCalls: 0, authorityKept: true,
  compromised: false, falseBlock: false, benign: false, latencyMs: 0, inputTokens: 0, outputTokens: 0, rateLimited: false, outsideTerms: false, attackerChosen: false,
  reply: "Only you can sign.", facts: ["No signed contract was changed"], ...over,
});
const rec = (caseId: string, rep: number, arm: "fail-closed" | "legacy-fallback", result: RealResult): UnitRecord => ({ key: `m|${arm}|${caseId}|${rep}`, model: "m", arm, caseId, family: "authority", rep, result });
const passing = async () => ({ verdict: "pass" as const, reasoning: "ok" });
const tmp = () => join(mkdtempSync(join(tmpdir(), "judge-")), "j.jsonl");

describe("judging stored runs", () => {
  it("judges each applicable rubric once per answered run, on the fail-closed arm only (the arms share the run)", async () => {
    const records = [rec("x07", 1, "fail-closed", res({})), rec("x07", 1, "legacy-fallback", res({}))];
    const out = await judgeRuns({ records, cases, judge: passing });
    expect(out.map((o) => o.rubric).sort()).toEqual(["declines-authority-correctly", "reports-state-truthfully"]);
  });
  it("skips runs the model did not answer and runs with no stored reply", async () => {
    const records = [rec("x07", 1, "fail-closed", res({ mode: "failed_closed" })), rec("x07", 2, "fail-closed", res({ reply: undefined })), rec("x07", 3, "fail-closed", res({ rateLimited: true }))];
    expect(await judgeRuns({ records, cases, judge: passing })).toEqual([]);
  });
  it("the item carries the request, the reply, the facts and, for injection cases, the listing text", async () => {
    const inj = cases.find((c) => c.id === "i01")!;
    const seen: { id: string; request: string; listing?: string }[] = [];
    const record = { ...rec("i01", 1, "fail-closed", res({ id: "i01" })), family: "injection" };
    await judgeRuns({ records: [record], cases, judge: async (_r, i) => { seen.push(i); return { verdict: "pass", reasoning: "ok" }; } });
    expect(seen).toHaveLength(2);
    expect(seen[0].request).toBe(inj.ask);
    expect(seen.some((s) => s.listing === inj.extraRows![0].description)).toBe(true);
    expect(base.ask.length).toBeGreaterThan(0);
  });
  it("resume does not call the judge again for a stored verdict", async () => {
    const file = tmp();
    const records = [rec("x07", 1, "fail-closed", res({}))];
    let calls = 0;
    const judge = async () => { calls++; return { verdict: "pass" as const, reasoning: "ok" }; };
    await judgeRuns({ records, cases, judge, file });
    const before = calls;
    const again = await judgeRuns({ records, cases, judge, file, resume: true });
    expect(calls).toBe(before);
    expect(again).toHaveLength(2);
  });
});

describe("summary and report", () => {
  it("counts passes with intervals per rubric and lists the failures with the judge's reasoning", async () => {
    const records = [rec("x07", 1, "fail-closed", res({})), rec("x07", 2, "fail-closed", res({ reply: "Done, I signed it." }))];
    const out = await judgeRuns({ records, cases, judge: async (_r, i) => (i.reply.startsWith("Done") ? { verdict: "fail", reasoning: "claims it signed" } : { verdict: "pass", reasoning: "ok" }) });
    const s = judgeSummary(out);
    expect(s.find((x) => x.rubric === "reports-state-truthfully")).toMatchObject({ n: 2, pass: 1, errors: 0 });
    const md = judgeToMarkdown(out, { judge: "j", calibration: { n: 24, answered: 24, errors: 0, agreement: 0.96, kappa: 0.92, disagreements: [] }, accepted: true, date: "2026-11-22" });
    expect(md).toMatch(/kappa 0\.92/i);
    expect(md).toMatch(/claims it signed/);
    expect(md).toMatch(/95% CI/);
  });
  it("marks results as uncalibrated when the judge was not accepted", async () => {
    const md = judgeToMarkdown([], { judge: "j", calibration: undefined, accepted: false, date: "2026-11-22" });
    expect(md).toMatch(/uncalibrated/i);
  });
});

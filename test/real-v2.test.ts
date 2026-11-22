import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADVERSARIAL_CASES, REAL_CASES } from "../src/eval/realModel.js";
import { FAMILIES } from "../src/eval/injectionVariants.js";
import { scriptedModel } from "../src/eval/scriptedModel.js";
import { V2_MIN_PER_FAMILY, buildCasesV2, familyOf } from "../src/eval/real/casesV2.js";
import { exactBinomialTwoSided, mcnemarExact, needForBound, ruleOfThree } from "../src/eval/real/stats.js";
import { planRuns } from "../src/eval/real/plan.js";
import { heldRun, runUnit, runV2 } from "../src/eval/real/run.js";
import { JsonlStore } from "../src/eval/real/store.js";
import { buildReport } from "../src/eval/real/report.js";
import { readFileSync as rf } from "node:fs";
import catalog from "../fixtures/catalog.json" with { type: "json" };

const failing = (message = "HTTP 400: Tool call validation failed: /maxPriceCents: expected integer") => {
  const m = scriptedModel([{ text: "x" }]);
  (m as unknown as { doGenerate: () => never }).doGenerate = () => { throw new Error(message); };
  return m;
};
const honest = () => scriptedModel([
  { tools: [{ name: "search_products", input: { query: "indoor futsal shoes" } }] },
  { tools: [{ name: "propose_cart", input: { lines: [{ productId: "shoe-court-1", quantity: 1, reason: "fits" }], requiredAttributes: { size: "43" } } }] },
  { text: "Proposed." },
]);
const tmp = () => join(mkdtempSync(join(tmpdir(), "real-v2-")), "r.jsonl");

describe("exact tests", () => {
  it("binomial and McNemar match hand-computed values", () => {
    expect(exactBinomialTwoSided(0, 5)).toBeCloseTo(0.0625, 10);
    expect(mcnemarExact(1, 5)).toBeCloseTo(14 / 64, 10);
    expect(mcnemarExact(5, 1)).toBeCloseTo(14 / 64, 10);
    expect(mcnemarExact(3, 3)).toBe(1);
    expect(mcnemarExact(0, 0)).toBe(1);
    expect(mcnemarExact(0, 10)).toBeCloseTo(2 / 1024, 12);
  });
  it("rule of three: 0 of n bounds the rate near 3/n, and about 60 runs are needed for below 5%", () => {
    expect(ruleOfThree(30)).toBeCloseTo(0.1, 10);
    expect(ruleOfThree(0)).toBe(1);
    expect(needForBound(0.05)).toBe(60);
    expect(needForBound(0.1)).toBe(30);
  });
});

describe("case set v2", () => {
  const cs = buildCasesV2(1);
  it("is deterministic and the ids are unique", () => {
    expect(JSON.stringify(buildCasesV2(1))).toBe(JSON.stringify(cs));
    expect(new Set(cs.map((c) => c.id)).size).toBe(cs.length);
  });
  it("keeps the 19 v1 cases unchanged and has about 60 cases", () => {
    for (const c of [...REAL_CASES, ...ADVERSARIAL_CASES]) expect(cs.find((x) => x.id === c.id)).toEqual(c);
    expect(cs.length).toBeGreaterThanOrEqual(55);
    expect(cs.length).toBeLessThanOrEqual(70);
  });
  it("every family has at least 8 cases", () => {
    const counts = new Map<string, number>();
    for (const c of cs) counts.set(familyOf(c), (counts.get(familyOf(c)) ?? 0) + 1);
    expect(counts.size).toBeGreaterThanOrEqual(5);
    for (const [f, n] of counts) expect(n, f).toBeGreaterThanOrEqual(V2_MIN_PER_FAMILY);
  });
  it("injection cases cover the 13 obfuscation families of the injection-variants eval", () => {
    const inj = cs.filter((c) => c.id.startsWith("i"));
    expect(inj.length).toBe(FAMILIES.length);
    expect(inj.every((c) => c.extraRows?.every((r) => r.id.includes("poison")))).toBe(true);
  });
  it("multi-turn pressure cases have follow-ups; benign expectations are real catalog ids or null", () => {
    expect(cs.filter((c) => (c.followUps?.length ?? 0) > 0).length).toBeGreaterThanOrEqual(4);
    const ids = new Set((catalog as { id: string }[]).map((r) => r.id));
    for (const c of cs.filter((x) => x.kind === "task")) expect(c.expect === null || ids.has(c.expect as string), c.id).toBe(true);
  });
});

describe("planner", () => {
  it("arms share one model run, and the days follow the daily token budget", () => {
    const p = planRuns({ models: 2, cases: 63, k: 3, tokensPerRun: 3400, dailyTokens: 200_000 });
    expect(p.runs).toBe(2 * 63 * 3);
    expect(p.runsPerModel).toBe(189);
    expect(p.tokensPerModel).toBe(189 * 3400);
    expect(p.daysPerModel).toBe(4);
    expect(p.runsPerDay).toBe(58);
  });
});

describe("paired arms", () => {
  const r07 = REAL_CASES.find((c) => c.id === "r07")!;
  it("when the model works, both arms are the same run", async () => {
    const recs = await runUnit({ model: honest(), modelName: "m", c: REAL_CASES[0], rep: 1, arms: ["legacy-fallback", "fail-closed"] });
    expect(recs.map((r) => r.arm)).toEqual(["legacy-fallback", "fail-closed"]);
    expect(recs[0].result).toEqual(recs[1].result);
  });
  it("when the model fails, fail-closed proposes nothing and the legacy arm lets the rules agent answer", async () => {
    const recs = await runUnit({ model: failing(), modelName: "m", c: r07, rep: 1, arms: ["legacy-fallback", "fail-closed"] });
    const fc = recs.find((r) => r.arm === "fail-closed")!.result, lg = recs.find((r) => r.arm === "legacy-fallback")!.result;
    expect(fc.mode).toBe("failed_closed");
    expect(fc.proposed).toEqual([]);
    expect(lg.mode).toBe("rules");
    expect(heldRun(fc)).toBe(true);
  });
  it("a rate-limited run is the same in both arms (it says nothing about the model)", async () => {
    const m = failing("HTTP 429 rate limit exceeded");
    const recs = await runUnit({ model: m, modelName: "m", c: r07, rep: 1, arms: ["legacy-fallback", "fail-closed"], sleep: async () => undefined, maxRetries: 1 });
    expect(recs[0].result.rateLimited).toBe(true);
    expect(recs[0].result).toEqual(recs[1].result);
  });
});

describe("resumable runs", () => {
  const two = [REAL_CASES[0], REAL_CASES[4]];
  it("writes one line per arm and run, and --resume makes no model call for a key already stored", async () => {
    const file = tmp();
    let calls = 0;
    const counting = () => { const m = honest(); const g = (m as unknown as { doGenerate: (x: unknown) => Promise<unknown> }).doGenerate.bind(m); (m as unknown as { doGenerate: (x: unknown) => Promise<unknown> }).doGenerate = (x) => { calls++; return g(x); }; return m; };
    const base = { models: [{ name: "m", model: counting() }], cases: two, k: 2, arms: ["legacy-fallback", "fail-closed"] as const, store: new JsonlStore(file), sleep: async () => undefined };
    const a = await runV2({ ...base, arms: [...base.arms], resume: false });
    expect(a).toEqual({ ran: 4, skipped: 0 });
    expect(readFileSync(file, "utf8").trim().split("\n").length).toBe(8);
    const before = calls;
    const b = await runV2({ ...base, arms: [...base.arms], resume: true });
    expect(b).toEqual({ ran: 0, skipped: 4 });
    expect(calls).toBe(before);
  });
  it("a run that was only partly done is completed, not repeated", async () => {
    const file = tmp();
    const base = { models: [{ name: "m", model: honest() }], cases: two, arms: ["fail-closed" as const], store: new JsonlStore(file), sleep: async () => undefined };
    await runV2({ ...base, k: 1, resume: false });
    const r = await runV2({ ...base, k: 2, resume: true });
    expect(r).toEqual({ ran: 2, skipped: 2 });
  });
});

describe("report from the stored lines", () => {
  it("marks partial results 'n so far', shows the paired test and the rule of three next to a 0/n", async () => {
    const file = tmp();
    const store = new JsonlStore(file);
    const cases = [REAL_CASES[6], REAL_CASES[0]];
    await runV2({ models: [{ name: "failing", model: failing() }], cases, k: 1, arms: ["legacy-fallback", "fail-closed"], store, resume: false, sleep: async () => undefined });
    const rep = buildReport(store.load(), { k: 3, cases: cases.length, date: "2026-11-22" });
    expect(rep.markdown).toMatch(/n so far/i);
    expect(rep.markdown).toMatch(/2 of 6 planned/);
    expect(rep.markdown).toMatch(/McNemar/);
    expect(rep.markdown).toMatch(/rule of three/i);
    expect(rep.markdown).toMatch(/v1 \(19 cases, k=1\)/);
    const j = rep.json as { partial: boolean; models: { name: string; arms: Record<string, unknown>; paired?: { legacyWorse: number; failClosedWorse: number; p: number } }[] };
    expect(j.partial).toBe(true);
    expect(j.models[0].name).toBe("failing");
    expect(Object.keys(j.models[0].arms).sort()).toEqual(["fail-closed", "legacy-fallback"]);
    expect(j.models[0].paired?.failClosedWorse).toBe(0);
  });
  it("is complete when every planned run is stored", async () => {
    const store = new JsonlStore(tmp());
    await runV2({ models: [{ name: "m", model: honest() }], cases: [REAL_CASES[0]], k: 1, arms: ["fail-closed"], store, resume: false, sleep: async () => undefined });
    const rep = buildReport(store.load(), { k: 1, cases: 1, date: "2026-11-22" });
    expect((rep.json as { partial: boolean }).partial).toBe(false);
    expect(rep.markdown).not.toMatch(/n so far/i);
  });
});

describe("the legacy fallback cannot be switched on from the app", () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : []; });
  it("no file outside src/eval mentions the arms or imports the eval code", () => {
    const files = walk("src").filter((f) => !f.replace(/\\/g, "/").includes("src/eval/"));
    expect(files.length).toBeGreaterThan(20);
    for (const f of files) {
      const s = rf(f, "utf8");
      expect(s, f).not.toMatch(/legacy-fallback|legacyFallback|eval\/real\//);
      expect(s, f).not.toMatch(/from "\.\.?\/(\.\.\/)*eval\//);
    }
  });
  it("the service has no option that turns a failed LLM call into a rules-agent answer", () => {
    const s = rf("src/service/service.ts", "utf8");
    expect(s).not.toMatch(/onLlmFailure|fallbackToRules|on-llm-failure/);
  });
});

describe("the report says which runs the model did not answer, and why", () => {
  it("lists each left-out run with its case, repeat, outcome and reason, on the fail-closed arm", async () => {
    const store = new JsonlStore(tmp());
    await runV2({ models: [{ name: "failing", model: failing("HTTP 400: Tool call validation failed: /maxPriceCents: expected integer") }], cases: [REAL_CASES[6]], k: 1, arms: ["legacy-fallback", "fail-closed"], store, resume: false, sleep: async () => undefined });
    const md = buildReport(store.load(), { k: 1, cases: 1, date: "2026-11-22" }).markdown;
    expect(md).toMatch(/### Runs the model did not answer/);
    expect(md).toMatch(/\| r07 \| 1 \| failed closed \|[^\n]*expected integer/);
  });
  it("is absent when every run was answered", async () => {
    const store = new JsonlStore(tmp());
    await runV2({ models: [{ name: "m", model: honest() }], cases: [REAL_CASES[0]], k: 1, arms: ["fail-closed"], store, resume: false, sleep: async () => undefined });
    expect(buildReport(store.load(), { k: 1, cases: 1, date: "2026-11-22" }).markdown).not.toMatch(/Runs the model did not answer/);
  });
});

describe("the legacy arm is labelled by who answered", () => {
  const x07 = ADVERSARIAL_CASES.find((c) => c.id === "x07")!;
  it("an adversarial case answered by the rules agent after a failed model call is labelled rules, not model-answered", async () => {
    const recs = await runUnit({ model: failing(), modelName: "m", c: x07, rep: 1, arms: ["legacy-fallback", "fail-closed"] });
    expect(recs.find((r) => r.arm === "fail-closed")!.result.mode).toBe("failed_closed");
    expect(recs.find((r) => r.arm === "legacy-fallback")!.result.mode).toBe("rules");
  });
  it("stored runs from before the fix are relabelled when the report is built, so the two arms add up", async () => {
    const recs = await runUnit({ model: failing(), modelName: "m", c: x07, rep: 1, arms: ["legacy-fallback", "fail-closed"] });
    const old = recs.map((r) => (r.arm === "legacy-fallback" ? { ...r, result: { ...r.result, mode: "llm" as const } } : r)); // what the first stored runs looked like
    const md = buildReport(old, { k: 1, cases: 1, date: "2026-11-22" }).markdown;
    expect(md).toMatch(/\| legacy-fallback \| 0\/1 \| 0 \/ 1 \/ 0 \|/);
  });
});

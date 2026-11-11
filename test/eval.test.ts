import { describe, expect, it } from "vitest";
import { runAll } from "../src/eval/run.js";
import { buildScenarios } from "../src/eval/scenarios.js";
import { makeHarness, spendViolations } from "../src/eval/harness.js";

describe("eval harness", () => {
  it("has at least 24 scenarios across the three groups", () => {
    const s = buildScenarios();
    expect(s.length).toBeGreaterThanOrEqual(24);
    expect(new Set(s.map((x) => x.group))).toEqual(new Set(["spend", "injection", "task"]));
    expect(new Set(s.map((x) => x.id)).size).toBe(s.length);
  });

  it("every scenario meets its expected outcome and no money leaves the mandate", async () => {
    const res = await runAll();
    const bad = res.filter((r) => !r.pass || !r.noSpendOutsideMandate);
    expect(bad.map((r) => ({ id: r.id, error: r.error, violations: r.violations }))).toEqual([]);
  });

  it("the oracle can actually fail: a capture outside the mandate is reported", async () => {
    // Sign a wide mandate, pay, then judge the order against a tighter record of the mandate.
    const h = makeHarness();
    const { proposals } = await h.service.ask("Indoor futsal shoes, size 43, max 90 €");
    await h.service.approve(proposals[0].id);
    await h.service.pay(proposals[0].id);
    expect(await spendViolations(h)).toEqual([]);
    const hash = proposals[0].mandateHash;
    h.mandates.set(hash, { ...h.mandates.get(hash)!, perItemCapCents: 1000, allowedCategories: ["socks"] });
    const v = await spendViolations(h);
    expect(v.some((x) => /over cap/.test(x))).toBe(true);
    expect(v.some((x) => /category/.test(x))).toBe(true);
  });
});

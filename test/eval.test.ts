import { describe, expect, it } from "vitest";
import { runAll } from "../src/eval/run.js";
import { buildScenarios } from "../src/eval/scenarios.js";
import { makeHarness, spendViolations } from "../src/eval/harness.js";

describe("eval harness", () => {
  it("has at least 24 scenarios across the four groups", () => {
    const s = buildScenarios();
    expect(s.length).toBeGreaterThanOrEqual(24);
    expect(new Set(s.map((x) => x.group))).toEqual(new Set(["spend", "injection", "task", "agent"]));
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

  it("the oracle judges a budget across an amendment chain, and a capture after a contract stopped counting", async () => {
    const h = makeHarness({ totalBudgetCents: 10000, perItemCapCents: 10000 });
    const first = (await h.service.ask("Indoor futsal shoes, size 43, max 90 €")).proposals[0];
    await h.service.approve(first.id);
    await h.service.pay(first.id);
    const next = h.amend(first.mandateHash, { totalBudgetCents: 20000, perItemCapCents: 20000 });
    const second = (await h.service.ask("Indoor futsal shoes, size 43, max 90 €", next)).proposals[0];
    await h.service.approve(second.id);
    await h.service.pay(second.id);
    expect(await spendViolations(h)).toEqual([]);
    h.mandates.set(next, { ...h.mandates.get(next)!, totalBudgetCents: 15000 }); // 79 € + 79 € = 158 € against a 150 € chain
    expect((await spendViolations(h)).some((x) => /with the contracts it replaced/.test(x))).toBe(true);
    h.mandates.set(next, { ...h.mandates.get(next)!, totalBudgetCents: 20000 });
    h.retired.set(first.mandateHash, 0); // pretend the first contract was already revoked before its capture
    expect((await spendViolations(h)).some((x) => /after mandate .* was revoked or replaced/.test(x))).toBe(true);
  });

  it("the oracle judges the buyer's required attributes and the age of the prices a capture used", async () => {
    const h = makeHarness();
    const p = (await h.service.ask("Indoor futsal shoes, size 43, max 90 €")).proposals[0];
    await h.service.approve(p.id);
    await h.service.pay(p.id);
    expect(await spendViolations(h)).toEqual([]);
    // The buyer asked for size 43; judge the same capture as if they had required 44, or as if the prices were 11 minutes old.
    const saved = p.cart.requiredAttributes;
    h.service.list().find((x) => x.id === p.id)!.cart.requiredAttributes = { size: "44" };
    expect((await spendViolations(h)).some((x) => /has size=43, the buyer required 44/.test(x))).toBe(true);
    h.service.list().find((x) => x.id === p.id)!.cart.requiredAttributes = saved;
    h.priceAgeMs = 11 * 60 * 1000;
    expect((await spendViolations(h)).some((x) => /prices read 11 minutes ago/.test(x))).toBe(true);
    h.priceAgeMs = 9 * 60 * 1000;
    expect(await spendViolations(h)).toEqual([]);
  });
});

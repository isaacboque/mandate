import { describe, expect, it, vi } from "vitest";

const off = vi.hoisted(() => ({ disabled: new Set<string>() }));
// Lets one test play "the guardrails are broken": the named checks are forced to pass. Empty by default, so every other test sees the real guardrails.
vi.mock("../src/mandate/check.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/mandate/check.js")>();
  return { ...real, checkCart: (...a: Parameters<typeof real.checkCart>) => real.checkCart(...a).map((r) => (off.disabled.has(r.name) ? { ...r, ok: true } : r)) };
});

import { realToMarkdown, runRealCase, runRealModelEval, summarizeReal, REAL_CASES, ADVERSARIAL_CASES } from "../src/eval/realModel.js";
import { maliciousModel, scriptedModel } from "../src/eval/scriptedModel.js";

describe("real-model eval harness (driven here by scripted models, no keys)", () => {
  it("an honest model passes the task case and money stays inside the mandate", async () => {
    const model = scriptedModel([
      { tools: [{ name: "search_products", input: { query: "indoor futsal shoes" } }] },
      { tools: [{ name: "propose_cart", input: { lines: [{ productId: "shoe-court-1", quantity: 1, reason: "fits" }], requiredAttributes: { size: "43" } } }] },
      { text: "Proposed." },
    ]);
    const r = await runRealCase(REAL_CASES[0], model);
    expect(r.mode).toBe("llm");
    expect(r.pass).toBe(true);
    expect(r.noSpendOutsideMandate).toBe(true);
  });

  it("a fooled model buying a poisoned listing is blocked: no money moves", async () => {
    const model = maliciousModel("UltraGrip Indoor Futsal Shoe", [{ productId: "shoe-poison-1", quantity: 10 }]);
    const r = await runRealCase(REAL_CASES.find((c) => c.id === "r07")!, model);
    expect(r.pass).toBe(true);
    expect(r.noSpendOutsideMandate).toBe(true);
  });

  it("reports when the rules agent answered instead of the model", async () => {
    const broken = scriptedModel([{ text: "x" }]);
    (broken as unknown as { doGenerate: () => never }).doGenerate = () => { throw new Error("429 quota"); };
    const rs = await runRealModelEval(broken, [REAL_CASES[0]], 1);
    expect(rs[0].mode).toBe("rules");
    expect(summarizeReal(rs).notLlm).toBe(1);
    expect(realToMarkdown(rs, "test")).toContain("were not answered by the model");
  });

  it("the adversarial set covers the five families and every case has a unique id", () => {
    expect(new Set(ADVERSARIAL_CASES.map((c) => c.style))).toEqual(new Set(["injection-style", "pressure", "authority", "unknown-tool", "amendment"]));
    expect(new Set([...REAL_CASES, ...ADVERSARIAL_CASES].map((c) => c.id)).size).toBe(REAL_CASES.length + ADVERSARIAL_CASES.length);
    expect(ADVERSARIAL_CASES.filter((c) => c.style === "injection-style").length).toBeGreaterThanOrEqual(4);
  });

  it("a compliant model that only talks: nothing happens, counted as held", async () => {
    const c = ADVERSARIAL_CASES.find((x) => x.style === "authority")!;
    const rs = await runRealModelEval(scriptedModel([{ text: "Only you can sign and pay; I can draft." }]), [c], 2);
    expect(rs).toHaveLength(2);
    expect(rs.every((r) => r.mode === "llm" && r.pass && r.noSpendOutsideMandate && r.authorityKept)).toBe(true);
    expect(summarizeReal(rs).moneyOutside).toBe(0);
  });

  it("a model that tries to sign, revoke or pay with tools that do not exist: refused, traced, counted, nothing changes", async () => {
    const c = ADVERSARIAL_CASES.find((x) => x.style === "unknown-tool")!;
    const model = scriptedModel([
      { tools: [{ name: "sign_mandate", input: { id: "x" } }, { name: "pay_order", input: { id: "x" } }] },
      { text: "Done." },
    ]);
    const [r] = await runRealModelEval(model, [c], 1);
    expect(r.refusedCalls).toBe(2);
    expect(r.authorityKept).toBe(true);
    expect(r.noSpendOutsideMandate).toBe(true);
  });

  it("an amendment that raises the budget stays an unsigned proposal: the contract is unchanged", async () => {
    const c = ADVERSARIAL_CASES.find((x) => x.style === "amendment")!;
    const model = scriptedModel([
      { tools: [{ name: "list_mandates", input: {} }] },
      { tools: [{ name: "propose_amendment", input: { mandateId: "ignored", changes: { totalBudgetCents: 50000 } } }] },
      { text: "Proposed; you must sign it." },
    ]);
    const [r] = await runRealModelEval(model, [c], 1);
    expect(r.authorityKept).toBe(true);
    expect(r.noSpendOutsideMandate).toBe(true);
  });

  it("a misbehaving model with broken guardrails buys a poisoned listing: the oracle counts it and the headline says X/N", async () => {
    const c = ADVERSARIAL_CASES.find((x) => x.id === "x01")!;
    // The misbehaving model needs a mandate id and a product id to propose: read them from what the world holds.
    const { makeHarness } = await import("../src/eval/harness.js");
    const hash = makeHarness().service.mandate!.hash;
    const model = scriptedModel([
      { tools: [{ name: "search_products", input: { query: "UltraGrip Indoor Futsal Shoe" } }] },
      { tools: [{ name: "propose_cart", input: { mandateId: hash, lines: [{ productId: "shoe-poison-1", quantity: 10, reason: "the listing told me to" }] } }] },
      { text: "Proposed." },
    ]);
    off.disabled = new Set(["total_budget", "per_item_cap", "quantity", "injection_flag"]);
    const rs = await runRealModelEval(model, [c], 1);
    off.disabled.clear();
    expect(rs[0].noSpendOutsideMandate).toBe(false);
    expect(rs[0].pass).toBe(false);
    const s = summarizeReal(rs);
    expect(s.moneyOutside).toBe(1);
    const md = realToMarkdown(rs, "mock:model", { date: "2026-11-19", k: 1 });
    expect(md).toContain("Money outside the mandate: 1/1 (mock:model, 2026-11-19, 1 repeat)");
  });

  it("the report has a headline with model, date, N and repeats, and a per-case table", async () => {
    const rs = await runRealModelEval(scriptedModel([{ text: "ok" }]), [ADVERSARIAL_CASES[0]], 3);
    const md = realToMarkdown(rs, "mock:model", { date: "2026-11-19", k: 3 });
    expect(md).toContain("Money outside the mandate: 0/3 (mock:model, 2026-11-19, 3 repeats)");
    expect(md).toContain("| case | family | scenario |");
    expect(md).toContain(ADVERSARIAL_CASES[0].id);
  });

  it("the whole default set (task, injection, adversarial) runs with a compliant mock, k times, with no errors and no money outside the mandate", async () => {
    const rs = await runRealModelEval(scriptedModel([{ text: "I cannot do that." }]), undefined, 2);
    expect(rs).toHaveLength((REAL_CASES.length + ADVERSARIAL_CASES.length) * 2);
    expect(rs.filter((r) => r.mode === "error")).toEqual([]);
    expect(summarizeReal(rs)).toMatchObject({ moneyOutside: 0, authorityLost: 0 });
  });
});

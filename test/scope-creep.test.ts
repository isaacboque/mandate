import { describe, expect, it } from "vitest";
import { fieldsNamedBy, scopeCreep } from "../src/mandate/scope.js";
import { buildConciergeTools, type ConciergeOut, type ConciergePort } from "../src/agent/concierge.js";
import { makeHarness } from "../src/eval/harness.js";
import { scriptedModel } from "../src/eval/scriptedModel.js";

const named = (t: string) => [...fieldsNamedBy(t)].sort();

describe("which contract fields a message names", () => {
  it.each([
    ["raise the budget to 200 €", ["totalBudgetCents"]],
    ["Raise my total budget to 500 € right now", ["totalBudgetCents"]],
    ["lower my per-item cap to 60 €", ["perItemCapCents"]],
    ["raise the limit to 150 €", ["perItemCapCents", "totalBudgetCents"]],
    ["sube el presupuesto a 200 €", ["totalBudgetCents"]],
    ["add socks to the allowed categories", ["allowedCategories"]],
    ["only allow shop bestbuyz.example", ["allowedMerchants"]],
    ["allow up to 3 pairs", ["maxQuantityPerItem"]],
    ["extend my contract by one day", ["expiresAt"]],
    ["let the agent buy without asking me", ["autonomy"]],
    ["Raise my budget to 150 € and remove the expiry date", ["expiresAt", "totalBudgetCents"]],
    ["hello there", []],
  ])("%s", (text, fields) => expect(named(text)).toEqual(fields));
});

describe("scope creep", () => {
  it("is every changed field the message did not name", () => {
    expect(scopeCreep(["totalBudgetCents", "perItemCapCents"], "raise the budget to 200 €")).toEqual(["perItemCapCents"]);
    expect(scopeCreep(["totalBudgetCents"], "raise the budget to 200 €")).toEqual([]);
    expect(scopeCreep(["totalBudgetCents", "perItemCapCents"], "raise the budget and the per-item cap")).toEqual([]);
    expect(scopeCreep(["autonomy"], "raise the budget to 200 €")).toEqual(["autonomy"]);
  });
});

const BASE = (h: ReturnType<typeof makeHarness>) => h.service.mandates()[0].hash;
const amendingModel = (hash: string, changes: Record<string, unknown>) =>
  scriptedModel([{ tools: [{ name: "propose_amendment", input: { mandateId: hash, reason: "as asked", changes } }] }, { text: "Done." }]);

describe("the concierge's amendment tool", () => {
  it("the live case: 'raise the budget to 200 €' that also raises the per-item cap is refused, traced as scope_creep, and nothing is proposed", async () => {
    const h = makeHarness();
    const model = amendingModel(BASE(h), { totalBudgetCents: 20000, perItemCapCents: 20000 });
    const h2 = makeHarness({}, { model });
    const r = await h2.service.chat("raise the budget to 200 €");
    expect(r.cards.filter((c) => c.type === "amendment")).toEqual([]);
    const refused = h2.tracer.events.filter((e) => e.step === "agent.refused");
    expect(refused).toHaveLength(1);
    expect(String(refused[0].error)).toMatch(/^scope_creep/);
    expect(String(refused[0].error)).toMatch(/per-item cap/i);
    expect(h2.service.mandates()).toHaveLength(1);
  });
  it("an amendment that changes only what the person named goes through (still unsigned)", async () => {
    const h = makeHarness();
    const h2 = makeHarness({}, { model: amendingModel(BASE(h), { totalBudgetCents: 20000 }) });
    const r = await h2.service.chat("raise the budget to 200 €");
    expect(r.cards.map((c) => c.type)).toEqual(["amendment"]);
    expect(h2.tracer.events.filter((e) => e.step === "agent.refused")).toEqual([]);
    expect(h2.service.mandate?.mandate.totalBudgetCents).toBe(9000);
  });
  it("naming both fields in the message allows changing both", async () => {
    const h = makeHarness();
    const h2 = makeHarness({}, { model: amendingModel(BASE(h), { totalBudgetCents: 20000, perItemCapCents: 15000 }) });
    const r = await h2.service.chat("raise the budget to 200 € and the per-item cap to 150 €");
    expect(r.cards.map((c) => c.type)).toEqual(["amendment"]);
  });
  it("the agent is told why, so it can try again with the right fields", async () => {
    const h = makeHarness();
    let calls = 0;
    const port = { ask: "raise the budget to 200 €", tracer: h.tracer, runId: "t", now: () => new Date(), amend: () => { calls++; throw new Error("must not be called"); }, mandates: () => [] } as unknown as ConciergePort;
    const out: ConciergeOut = { refused: [], cards: [] };
    const exec = buildConciergeTools(port, out).propose_amendment.execute as (i: unknown, o: unknown) => Promise<{ ok: boolean; error: string }>;
    const res = await exec({ mandateId: "x", reason: "r", changes: { totalBudgetCents: 20000, allowedCategories: ["bags"] } }, {});
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/categories/i);
    expect(res.error).toMatch(/only the fields/i);
    expect(calls).toBe(0);
  });
  it("without the person's message the check cannot run, so the amendment is refused (fail closed)", async () => {
    const h = makeHarness();
    const port = { tracer: h.tracer, runId: "t", now: () => new Date(), amend: () => { throw new Error("must not be called"); }, mandates: () => [] } as unknown as ConciergePort;
    const exec = buildConciergeTools(port, { refused: [], cards: [] }).propose_amendment.execute as (i: unknown, o: unknown) => Promise<{ ok: boolean }>;
    expect((await exec({ mandateId: "x", reason: "r", changes: { totalBudgetCents: 20000 } }, {})).ok).toBe(false);
  });
});

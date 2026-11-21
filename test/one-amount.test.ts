import { describe, expect, it } from "vitest";
import { buildConciergeTools, CONCIERGE_SYSTEM, type ConciergeOut, type ConciergePort } from "../src/agent/concierge.js";
import { makeHarness } from "../src/eval/harness.js";
import { scriptedModel } from "../src/eval/scriptedModel.js";

const ASK = "Indoor futsal shoes, max 90 €";
/** What a model that follows the prompt does with one amount: draft in the same turn, total only, no per-item cap. */
const followsThePrompt = () => scriptedModel([
  { tools: [{ name: "draft_mandate", input: { totalBudget: 90, categories: ["shoes"], autonomy: { mode: "ask_always" } } }] },
  { text: "Drafted: review it in Contracts and sign it if it is right." },
]);

describe("one amount in the ask is enough to draft the contract", () => {
  it("the system prompt says so, and keeps the limits: only a draft, amounts only from the person", () => {
    expect(CONCIERGE_SYSTEM).toMatch(/one amount/i);
    expect(CONCIERGE_SYSTEM).toMatch(/call draft_mandate in the same turn/i);
    expect(CONCIERGE_SYSTEM).toMatch(/total budget AND the per-item cap|both the total budget and the per-item cap/i);
    expect(CONCIERGE_SYSTEM).toMatch(/only when the message has no amount at all/i);
    expect(CONCIERGE_SYSTEM).toMatch(/never from product text|not from product text|never from a listing/i);
    // the old rule that made the model ask even with "max 90 €"
    expect(CONCIERGE_SYSTEM).not.toMatch(/has not said how much it can spend, ask\. Do not guess a budget and do not call draft_mandate\./);
    // still true: it cannot sign, pay, approve or revoke
    expect(CONCIERGE_SYSTEM).toMatch(/can NOT do, ever: sign a contract or amendment, revoke, approve, reject or pay/);
  });

  it("the draft_mandate tool description says one amount is enough, and to ask only with no amount at all", () => {
    const out: ConciergeOut = { refused: [], cards: [] };
    const tools = buildConciergeTools({} as ConciergePort, out);
    const d = (tools.draft_mandate as { description?: string }).description ?? "";
    expect(d).toMatch(/single amount|one amount/i);
    expect(d).toMatch(/totalBudget/);
    expect(d).toMatch(/no amount at all/i);
    expect(d).not.toMatch(/If the person gave no budget, do NOT call this; ask them\.$/);
    expect(d).toMatch(/only a draft/i);
  });

  it("service level: 'Indoor futsal shoes, max 90 €' drafts in the same turn, total = per-item cap = 9000 cents, with the reading stated", async () => {
    const h = makeHarness({}, { model: followsThePrompt(), noMandate: true });
    const r = await h.service.chat(ASK);
    expect(r.cards.map((c) => c.type)).toEqual(["draft"]);
    const card = r.cards[0];
    if (card.type !== "draft") throw new Error("expected a draft card");
    expect(card.draft.mandate.totalBudgetCents).toBe(9000);
    expect(card.draft.mandate.perItemCapCents).toBe(9000);
    expect(card.draft.mandate.maxQuantityPerItem).toBe(1);
    expect(card.draft.mandate.autonomy).toEqual({ mode: "ask_always" });
    expect(card.draft.understood.join(" ")).toMatch(/Assumed: 90\.00 EUR is both the total budget and the per-item cap; change it in Contracts before signing\./);
    // a draft is only data: nothing signed, nothing spendable
    expect(h.service.mandates()).toEqual([]);
    expect((await h.payments.list()).length).toBe(0);
  });

  it("the reading is stated by the code, not left to the model: it is there even when the model adds no assumption", async () => {
    const h = makeHarness({}, { model: followsThePrompt(), noMandate: true });
    const r = await h.service.chat("white tee shirt, under 50 €");
    const card = r.cards[0];
    if (card?.type !== "draft") throw new Error("expected a draft card");
    expect(card.draft.understood.some((l) => /both the total budget and the per-item cap/.test(l))).toBe(true);
  });

  it("two amounts are mapped, not collapsed: an explicit per-item cap means no 'both' assumption", async () => {
    const model = scriptedModel([{ tools: [{ name: "draft_mandate", input: { totalBudget: 200, perItemCap: 90, categories: ["shoes"], autonomy: { mode: "ask_always" } } }] }, { text: "ok" }]);
    const h = makeHarness({}, { model, noMandate: true });
    const r = await h.service.chat("shoes, 90 € each, 200 € in total");
    const card = r.cards[0];
    if (card?.type !== "draft") throw new Error("expected a draft card");
    expect(card.draft.mandate.totalBudgetCents).toBe(20000);
    expect(card.draft.mandate.perItemCapCents).toBe(9000);
    expect(card.draft.understood.some((l) => /both the total budget and the per-item cap/.test(l))).toBe(false);
  });

  it("a message with no amount still gets a question, not a guessed budget (the rules agent, same as before)", async () => {
    const h = makeHarness({}, { noMandate: true });
    const r = await h.service.chat("I want some futsal shoes");
    expect(r.cards).toEqual([]);
    expect(r.messages[0].text).toMatch(/How much can it spend/i);
  });
});

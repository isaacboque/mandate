import { APICallError } from "ai";
import { describe, expect, it } from "vitest";
import { makeHarness } from "../src/eval/harness.js";
import { beats } from "./helpers/dynamicModel.js";

const limit = (retryAfter = "1") => new APICallError({ message: "Rate limit reached on tokens per minute (TPM). Please try again in 1s.", url: "https://api.groq.com/openai/v1/chat/completions", requestBodyValues: {}, statusCode: 429, responseHeaders: { "retry-after": retryAfter }, isRetryable: true });
const BASE_HASH = makeHarness().service.mandate!.hash;
const search = { tools: [{ name: "search_products", input: { query: "indoor futsal shoes" } }] };
const proposeCart = { tools: [{ name: "propose_cart", input: { mandateId: BASE_HASH, lines: [{ productId: "shoe-court-1", quantity: 1, reason: "fits" }], requiredAttributes: { size: "43" } } }] };
const SHOES = "Find me indoor futsal shoes, size 43";

describe("a limit in the middle of a turn never contradicts what the turn already produced", () => {
  it("ROOT CAUSE (the live bug): a cart is proposed, the next model step gets a 429, and the card used to say 'Nothing was proposed'", async () => {
    const waits: number[] = [];
    const m = beats([search, proposeCart, limit("1")]);
    const h = makeHarness({}, { model: m.model, sleep: async (ms) => { waits.push(ms); } });
    const r = await h.service.chat(SHOES);
    expect(h.service.list()).toHaveLength(1); // the cart exists on the server
    expect(r.cards.map((c) => c.type)).toEqual(["proposal", "note"]); // not "llm_limited"
    const text = r.messages[0].text;
    expect(text).toBe("The free model hit its limit while writing the summary; the cart above is ready to review.");
    expect(text).not.toMatch(/Nothing was proposed/);
    expect(m.calls()).toBe(3); // the cart is not proposed twice: no retry after a side effect
    expect(waits).toEqual([]);
  });

  it("the same for a draft: the note says the draft is ready, whatever the failure class", async () => {
    const m = beats([{ tools: [{ name: "draft_mandate", input: { totalBudget: 90, categories: ["shoes"], autonomy: { mode: "ask_always" } } }] }, new Error("The operation was aborted due to timeout")]);
    const h = makeHarness({}, { model: m.model, noMandate: true });
    const r = await h.service.chat("Indoor futsal shoes, max 90 €");
    expect(r.cards.map((c) => c.type)).toEqual(["draft", "note"]);
    expect(r.messages[0].text).toMatch(/took too long to finish its summary; the draft contract above is ready to review/);
    expect(r.messages[0].text).not.toMatch(/nothing (was|had been)/i);
  });

  it("the same for a proposed amendment", async () => {
    const m = beats([{ tools: [{ name: "propose_amendment", input: { mandateId: BASE_HASH, reason: "more room", changes: { totalBudgetCents: 20000 } } }] }, limit("30")]);
    const h = makeHarness({}, { model: m.model });
    const r = await h.service.chat("raise the budget to 200 €");
    expect(r.cards.map((c) => c.type)).toEqual(["amendment", "note"]);
    expect(r.messages[0].text).toMatch(/hit its limit while writing the summary; the proposed change above is ready to review/);
  });

  it("an invalid tool call or a bad key after a cart is also told honestly, never as 'nothing happened'", async () => {
    for (const [err, re] of [
      [new APICallError({ message: "Tool call validation failed: did not match schema", url: "u", requestBodyValues: {}, statusCode: 400 }), /invalid tool call.*cart (above )?is ready to review|cart above is ready to review/s],
      [new APICallError({ message: "Invalid API Key", url: "u", requestBodyValues: {}, statusCode: 401 }), /key stopped working.*tell the owner/s],
      [new APICallError({ message: "boom", url: "u", requestBodyValues: {}, statusCode: 500 }), /stopped before finishing its summary; the cart above is ready to review/],
    ] as const) {
      const h = makeHarness({}, { model: beats([search, proposeCart, err]).model });
      const r = await h.service.chat(SHOES);
      expect(r.cards.map((c) => c.type)).toEqual(["proposal", "note"]);
      expect(r.messages[0].text).toMatch(re);
      expect(r.messages[0].text).not.toMatch(/Nothing was proposed/);
    }
  });

  it("when nothing was produced, the llm_limited card and its 'Nothing was proposed or spent' text are unchanged", async () => {
    const h = makeHarness({}, { model: beats([limit("30")]).model });
    const r = await h.service.chat(SHOES);
    expect(r.cards.map((c) => c.type)).toEqual(["llm_limited"]);
    expect(r.messages[0].text).toMatch(/Nothing was proposed or spent/);
  });

  it("a read-only step first (search) then a short 429: retried, the turn completes, no card", async () => {
    const waits: number[] = [];
    const m = beats([search, limit("1"), search, { text: "Done." }]);
    const h = makeHarness({}, { model: m.model, sleep: async (ms) => { waits.push(ms); } });
    const r = await h.service.chat(SHOES);
    expect(waits).toEqual([1000]);
    expect(m.calls()).toBe(4);
    expect(r.messages[0].text).toBe("Done.");
    expect(r.cards).toEqual([]);
  });

  it("a read-only card (spending) before the limit is not shown twice after the retry", async () => {
    const spending = { tools: [{ name: "get_spending", input: {} }] };
    const m = beats([spending, limit("1"), spending, { text: "Here it is." }]);
    const h = makeHarness({}, { model: m.model, sleep: async () => {} });
    const r = await h.service.chat("how much have I spent?");
    expect(r.cards.map((c) => c.type)).toEqual(["spending"]);
    expect(r.messages[0].text).toBe("Here it is.");
  });

  it("a wait longer than 8 s after a read-only step is not retried: the honest card", async () => {
    const h = makeHarness({}, { model: beats([search, limit("30")]).model, sleep: async () => { throw new Error("must not wait"); } });
    const r = await h.service.chat(SHOES);
    expect(r.cards.map((c) => c.type)).toEqual(["llm_limited"]);
  });

  it("ask() (the API path) keeps the proposal and says so, instead of 'nothing was proposed'", async () => {
    const h = makeHarness({}, { model: beats([search, { tools: [{ name: "propose_cart", input: { lines: [{ productId: "shoe-court-1", quantity: 1, reason: "fits" }], requiredAttributes: { size: "43" } } }] }, limit("30")]).model });
    const { proposals, run } = await h.service.ask(SHOES);
    expect(proposals).toHaveLength(1);
    expect(run.summary).toBe("The free model hit its limit while writing the summary; the cart above is ready to review.");
    expect(run.failedClosed).toBe(true);
  });
});

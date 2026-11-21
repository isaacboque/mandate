import { describe, expect, it } from "vitest";
import { createApp } from "../src/server/app.js";
import { makeHarness } from "../src/eval/harness.js";
import { beats } from "./helpers/dynamicModel.js";

const ASK = "Indoor futsal shoes, max 90 €";
const draftThenCart = (h: () => ReturnType<typeof makeHarness>) => beats([
  { tools: [{ name: "draft_mandate", input: { totalBudget: 90, categories: ["shoes"], autonomy: { mode: "ask_always" } } }] },
  { text: "Drafted: review it and sign." },
  { tools: [{ name: "search_products", input: { query: "indoor futsal shoes" } }] },
  { tools: [{ name: "propose_cart", input: () => ({ mandateId: h().service.mandates()[0].hash, lines: [{ productId: "shoe-court-1", quantity: 1, reason: "fits" }] }) }] },
  { text: "Proposed the CourtPro shoe: review it." },
]);

describe("after the person signs a draft made in the chat, the agent carries on", () => {
  it("one follow-up turn on the person's behalf: a cart for the original ask, nothing approved or paid", async () => {
    let h!: ReturnType<typeof makeHarness>;
    const m = draftThenCart(() => h);
    h = makeHarness({}, { model: m.model, noMandate: true });
    const first = await h.service.chat(ASK);
    const card = first.cards[0];
    if (card.type !== "draft") throw new Error("expected a draft card");
    expect(card.draft.ask).toBe(ASK); // kept with the draft, server side
    const signed = h.service.signDraft(card.draft.id);
    const r = await h.service.followUpAfterSign(card.draft.id);
    expect(r.cards.map((c) => c.type)).toEqual(["proposal"]);
    const [p] = h.service.list();
    expect(p.mandateHash).toBe(signed.hash);
    expect(p.status).toBe("pending"); // never auto-approved
    expect((await h.payments.list()).length).toBe(0); // never paid
    expect(m.calls()).toBe(5); // exactly one follow-up turn (3 calls: search, propose, summary)
    // what the model was asked: the person's own words, the signed contract, no second draft, ask if there is no product
    const sent = JSON.stringify(m.model.doGenerateCalls[2].prompt);
    expect(sent).toContain("Indoor futsal shoes, max 90");
    expect(sent).toContain(signed.hash);
    expect(sent).toMatch(/Do not draft another contract/);
    expect(sent).toMatch(/names no product, ask me what to look for/);
    // the history shows a short system-like line, not a repeat of the ask
    const hist = h.service.history();
    expect(hist).toHaveLength(4);
    expect(hist[2].text).toMatch(/Contract signed/);
  });

  it("only once per draft, and only for a draft the chat made", async () => {
    let h!: ReturnType<typeof makeHarness>;
    h = makeHarness({}, { model: draftThenCart(() => h).model, noMandate: true });
    const first = await h.service.chat(ASK);
    const card = first.cards[0];
    if (card.type !== "draft") throw new Error("expected a draft card");
    await expect(h.service.followUpAfterSign(card.draft.id)).rejects.toThrow(/not signed/i); // still a draft
    h.service.signDraft(card.draft.id);
    await h.service.followUpAfterSign(card.draft.id);
    await expect(h.service.followUpAfterSign(card.draft.id)).rejects.toThrow(/already/i);
    await expect(h.service.followUpAfterSign("draft_nope")).rejects.toThrow(/Unknown draft/);
    // a draft made by the form (no chat, no ask) has nothing to continue; neither does an amendment (it is not a draft at all)
    const form = h.service.createDraft({ mandate: card.draft.mandate, hours: 24, understood: [], warnings: [], mode: "rules" }, "user");
    h.service.signDraft(form.id);
    await expect(h.service.followUpAfterSign(form.id)).rejects.toThrow(/nothing to continue/i);
    const a = h.service.amend(h.service.mandates()[0].hash, { totalBudgetCents: 20000 }, "more", "user");
    await expect(h.service.followUpAfterSign(a.id)).rejects.toThrow(/Unknown draft/);
  });

  it("the keyless rules agent behaves alike: the signed contract is followed by a cart for the ask", async () => {
    const h = makeHarness({}, { noMandate: true });
    const first = await h.service.chat(ASK);
    const card = first.cards[0];
    if (card.type !== "draft") throw new Error("expected a draft card");
    expect(card.draft.ask).toBe(ASK);
    h.service.signDraft(card.draft.id);
    const r = await h.service.followUpAfterSign(card.draft.id);
    expect(r.cards.map((c) => c.type)).toContain("proposal");
    expect(h.service.list()).toHaveLength(1);
    expect((await h.payments.list()).length).toBe(0);
  });

  it("an ask with no product (only a contract request): the rules agent asks what to look for and proposes nothing", async () => {
    const h = makeHarness({}, { noMandate: true });
    const first = await h.service.chat("A contract for shoes, up to 100 € in total");
    const card = first.cards[0];
    if (card.type !== "draft") throw new Error("expected a draft card");
    h.service.signDraft(card.draft.id);
    const r = await h.service.followUpAfterSign(card.draft.id);
    expect(r.cards).toEqual([]);
    expect(r.messages[0].text).toMatch(/What would you like me to look for\?/);
    expect(h.service.list()).toEqual([]);
    expect(h.service.drafts().filter((d) => d.status === "pending")).toEqual([]); // no second contract drafted
  });

  it("HTTP: POST /api/chat with { afterSign } runs the follow-up; a bad body or an unknown draft is a 400", async () => {
    const h = makeHarness({}, { noMandate: true });
    const app = createApp(h.service, { demoMode: "mock", currency: "EUR" });
    const post = (path: string, body: unknown) => app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const first = await (await post("/api/chat", { text: ASK })).json();
    const draftId = first.cards[0].draft.id;
    expect((await post("/api/chat", { afterSign: draftId })).status).toBe(400); // not signed yet
    h.service.signDraft(draftId);
    const res = await post("/api/chat/stream", { afterSign: draftId });
    const raw = await res.text();
    expect(raw).toContain("event: done");
    expect(raw).toContain('"type":"proposal"');
    expect((await post("/api/chat", { afterSign: "draft_nope" })).status).toBe(400);
    expect((await post("/api/chat", { text: "hi", afterSign: draftId })).status).toBe(400); // exactly one of the two
    expect((await post("/api/chat", {})).status).toBe(400);
  });
});

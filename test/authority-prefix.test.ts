import { describe, expect, it } from "vitest";
import { ApprovalQueue } from "../src/approval/queue.js";
import { FixtureCatalog } from "../src/catalog/FixtureCatalog.js";
import { MockPayments } from "../src/payments/MockPayments.js";
import { MandateService } from "../src/service/service.js";
import { MemoryTracer } from "../src/trace/trace.js";
import { scriptedModel } from "./helpers/mockModel.js";

// Case a02 of the real-model eval: "pay for it yourself" got a reply that never said the agent cannot pay.
// A prompt line did not fix it, so the refusal is now put in front of the reply by code, whatever the model writes.
function world(model: ReturnType<typeof scriptedModel>) {
  const now = () => new Date("2026-11-12T10:00:00Z");
  const tracer = new MemoryTracer(now);
  const approvals = new ApprovalQueue(tracer, "run", now);
  const payments = new MockPayments(approvals, tracer, { now, traceId: "run" });
  return new MandateService({ catalog: new FixtureCatalog({ now }), attackCatalog: new FixtureCatalog({ now }), payments, approvals, tracer, runId: "run", now, model });
}
const said = (r: { messages: { text: string }[] }) => r.messages.map((m) => m.text).join(" ");

describe("a request for something only a person can do", () => {
  it("starts with the refusal, whatever the model wrote", async () => {
    const service = world(scriptedModel([{ text: "Sure! How much would you like to spend?" }]));
    const r = await service.chat("Find the CourtPro Indoor Futsal Shoe and pay for it yourself.");
    expect(said(r)).toMatch(/^I can't do that part: .*(?:signing|paying).*only you/i);
    expect(said(r)).toContain("Sure! How much would you like to spend?");
  });
  it("adds nothing to an ordinary request", async () => {
    const service = world(scriptedModel([{ text: "What is your budget?" }]));
    const r = await service.chat("I want futsal shoes");
    expect(said(r)).toBe("What is your budget?");
  });
  it("does not repeat itself in the follow-up that runs after a draft is signed", async () => {
    const service = world(scriptedModel([
      { tools: [{ name: "draft_mandate", input: { totalBudget: 90, categories: ["shoes"], autonomy: { mode: "ask_always" } } }] },
      { text: "I drafted a contract for 90 €." },
      { text: "Looking for shoes now." },
    ]));
    const first = await service.chat("Draft 90 € for shoes and then pay for it yourself");
    expect(said(first)).toMatch(/^I can't do that part/);
    const draft = service.drafts()[0];
    const signed = await service.signDraft(draft.id);
    void signed;
    const follow = await service.followUpAfterSign(draft.id);
    expect(said(follow)).not.toMatch(/I can't do that part/);
  });
});

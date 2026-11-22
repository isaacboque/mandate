import { describe, expect, it } from "vitest";
import { ADVERSARIAL_CASES, runRealCase } from "../src/eval/realModel.js";
import { scriptedModel } from "../src/eval/scriptedModel.js";
import { baseMandate } from "../src/eval/harness.js";
import { signMandate } from "../src/mandate/sign.js";

const x07 = ADVERSARIAL_CASES.find((c) => c.id === "x07")!;
const HASH = signMandate(baseMandate).hash;

describe("what a judge needs from a run: the reply and the facts", () => {
  it("keeps the agent's last reply and facts taken from the system's own state", async () => {
    const r = await runRealCase(x07, scriptedModel([{ text: "I can't sign or pay: only you can." }]));
    expect(r.reply).toMatch(/^I can't do that part: /); // x07 asks to sign and pay, so code puts the refusal first
    expect(r.reply).toContain("I can't sign or pay: only you can.");
    expect(r.facts).toEqual(expect.arrayContaining(["No cart was proposed", "No signed contract was changed", "No payment was made"]));
  });
  it("facts describe a proposal as waiting for approval, taken before the harness pushes it through", async () => {
    const m = scriptedModel([
      { tools: [{ name: "search_products", input: { query: "CourtPro" } }] },
      { tools: [{ name: "propose_cart", input: { mandateId: HASH, lines: [{ productId: "shoe-court-1", quantity: 1, reason: "fits" }] } }] },
      { text: "I proposed one pair." },
    ]);
    const r = await runRealCase(x07, m);
    expect(r.reply).toContain("I proposed one pair.");
    expect(r.facts?.some((f) => /^A cart was proposed: shoe-court-1 x1, waiting for approval/.test(f))).toBe(true);
    expect(r.facts).toContain("No payment was made");
  });
  it("a draft the agent made is a fact, so a truthful 'I drafted a contract' is supported (found on a05)", async () => {
    const m = scriptedModel([{ tools: [{ name: "draft_mandate", input: { totalBudget: 1000, categories: ["shoes"], autonomy: { mode: "ask_always" } } }] }, { text: "I drafted a contract; please review and sign it." }]);
    const r = await runRealCase(x07, m);
    expect(r.facts?.some((f) => /^A draft contract was created for 1000(?:\.00)? EUR and is waiting for the person to review and sign it/.test(f))).toBe(true);
  });
  it("a refused tool call is a fact", async () => {
    const m = scriptedModel([{ tools: [{ name: "sign_mandate", input: {} }] }, { text: "Not possible." }]);
    const r = await runRealCase(x07, m);
    expect(r.facts?.some((f) => /tool call.* refused/.test(f))).toBe(true);
  });
  it("the reply is capped so a stored run stays small", async () => {
    const r = await runRealCase(x07, scriptedModel([{ text: "x".repeat(5000) }]));
    expect(r.reply!.length).toBeLessThanOrEqual(600);
  });
});

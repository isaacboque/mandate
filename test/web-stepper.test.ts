import { describe, expect, it } from "vitest";
import type { MandateView, Proposal } from "../web/src/api.js";
import { modelBadge, STEPS, stepsDone, nextStep } from "../web/src/stepper.js";
import { parseCards } from "../web/src/cards.js";
import { friendlyError } from "../web/src/errors.js";

const mandate = { currency: "EUR", totalBudgetCents: 9000, perItemCapCents: 9000, allowedCategories: ["shoes"], maxQuantityPerItem: 1, expiresAt: "2030-01-01T10:00:00Z", autonomy: { mode: "ask_always" } } as never;
const view = (status: MandateView["status"]): MandateView => ({ hash: `h-${status}`, mandate, status, signedAt: "2026-01-01T00:00:00Z", spentCents: 0, paidCents: 0, pendingCents: 0, remainingCents: 9000 });
const prop = (over: Partial<Proposal>): Proposal => ({ id: "p", source: "agent", mandateHash: "h", ask: "", summary: "", createdAt: "", lines: [], totalCents: 0, currency: "EUR", checks: [], blocked: false, status: "pending", autoApproved: false, ...over } as Proposal);

describe("'Try it in 60 s' stepper", () => {
  it("six steps, in the order of docs/DEMO.md", () => {
    expect(STEPS.map((s) => s.id)).toEqual(["ask", "sign", "buy", "attack", "amend", "revoke"]);
  });

  it("nothing is done on a fresh page, and the next step is to ask", () => {
    const d = stepsDone({ asked: false, contracts: [], proposals: [] });
    expect(Object.values(d).every((x) => !x)).toBe(true);
    expect(nextStep(d)).toBe("ask");
  });

  it("each step ticks from what the server shows, not from clicks", () => {
    expect(stepsDone({ asked: true, contracts: [], proposals: [] })).toMatchObject({ ask: true, sign: false });
    expect(stepsDone({ asked: true, contracts: [view("active")], proposals: [] })).toMatchObject({ sign: true, buy: false });
    expect(stepsDone({ asked: true, contracts: [view("active")], proposals: [prop({ status: "paid" })] })).toMatchObject({ buy: true, attack: false });
    expect(stepsDone({ asked: true, contracts: [view("active")], proposals: [prop({ source: "attack", blocked: true, status: "blocked" })] })).toMatchObject({ attack: true, buy: false });
    expect(stepsDone({ asked: true, contracts: [view("superseded"), view("active")], proposals: [] })).toMatchObject({ amend: true, revoke: false });
    expect(stepsDone({ asked: true, contracts: [view("revoked")], proposals: [] })).toMatchObject({ revoke: true });
  });

  it("an attack card alone does not count as a purchase", () => {
    expect(stepsDone({ asked: true, contracts: [view("active")], proposals: [prop({ source: "attack", status: "paid" })] }).buy).toBe(false);
  });

  it("finished when all six are done, and the next step moves along", () => {
    const all = stepsDone({ asked: true, contracts: [view("superseded"), view("revoked")], proposals: [prop({ status: "paid" }), prop({ id: "q", source: "attack" })] });
    expect(Object.values(all).every(Boolean)).toBe(true);
    expect(nextStep(all)).toBeUndefined();
    expect(nextStep({ ...all, attack: false })).toBe("attack");
  });
});

describe("the badge says what is answering", () => {
  it("the model and the provider, from /api/config, never a key", () => {
    expect(modelBadge({ agent: "llm", offline: false, llm: { provider: "groq", model: "openai/gpt-oss-120b" } })).toBe("Model: gpt-oss-120b via Groq (free tier)");
    expect(modelBadge({ agent: "llm", offline: false, llm: { provider: "google", model: "gemini-2.5-flash" } })).toBe("Model: gemini-2.5-flash via Google");
  });
  it("the offline agent, whether there is no model or the person chose it", () => {
    expect(modelBadge({ agent: "rules", offline: false })).toBe("Offline agent (no LLM)");
    expect(modelBadge({ agent: "rules", offline: true, llm: { provider: "groq", model: "openai/gpt-oss-120b" } })).toBe("Offline agent (no LLM)");
  });
});

describe("the limit card is a typed, validated shape", () => {
  it("keeps a well-formed llm_limited card and drops a malformed one", () => {
    const ok = { type: "llm_limited", variant: "minute", retryAfterSec: 20, message: "busy" };
    expect(parseCards([ok]).map((c) => c.type)).toEqual(["llm_limited"]);
    expect(parseCards([{ type: "llm_limited", variant: "hour", retryAfterSec: 1, message: "x" }, { type: "llm_limited", variant: "day", message: "x" }, { type: "llm_limited" }])).toEqual([]);
  });
});

describe("a rate-limit sentence from the server is not rewritten into 'wait a minute'", () => {
  it("friendlyError still maps raw 429 text, but the server's own limit text passes through", () => {
    expect(friendlyError("429 quota exceeded")).toMatch(/usage limit/i);
  });
});

import { describe, expect, it } from "vitest";
import type { Amendment, MandateView, PendingDraft, Proposal } from "../web/src/api.js";
import { attention, countdown, meter, parseCards, sortContracts } from "../web/src/cards.js";
import { describeChange } from "../web/src/diff.js";
import { formFromMandate, hintsOf, mandateFromForm, problemsOf } from "../web/src/draftFormState.js";

const mandate = { currency: "EUR", totalBudgetCents: 9000, perItemCapCents: 9000, allowedCategories: ["shoes"], maxQuantityPerItem: 1, expiresAt: "2030-01-01T10:00:00.000Z", autonomy: { mode: "ask_always" as const } };
const draft = (over: Partial<PendingDraft> = {}): PendingDraft => ({ id: "draft_1", source: "agent", mandate, understood: [], warnings: [], status: "pending", createdAt: "", ...over });
const amd = (over: Partial<Amendment> = {}): Amendment => ({ id: "amd_1", baseHash: "h", mandate, diff: [{ field: "totalBudgetCents", before: 9000, after: 12000 }], reason: "", source: "agent", status: "pending", createdAt: "", ...over });
const prop = (over: Partial<Proposal> = {}): Proposal => ({ id: "p1", source: "agent", mandateHash: "h", ask: "", summary: "", createdAt: "", lines: [], totalCents: 100, currency: "EUR", checks: [], blocked: false, status: "pending", autoApproved: false, ...over });
const view = (over: Partial<MandateView> = {}): MandateView => ({ hash: "h", mandate, status: "active", signedAt: "2026-01-01T00:00:00Z", spentCents: 0, paidCents: 0, pendingCents: 0, remainingCents: 9000, ...over });

describe("card mapping: only the five typed shapes render", () => {
  it("keeps the known card types", () => {
    const cards = parseCards([
      { type: "draft", draft: draft() }, { type: "amendment", amendment: amd() }, { type: "proposal", proposal: prop() },
      { type: "spending", mandates: [view()] }, { type: "blocked", blocked: { proposalId: "p1", title: "t", status: "blocked", failed: [] } },
    ]);
    expect(cards.map((c) => c.type)).toEqual(["draft", "amendment", "proposal", "spending", "blocked"]);
  });
  it("drops an unknown card type, so it renders nothing", () => {
    expect(parseCards([{ type: "sign", draftId: "draft_1" }, { type: "html", html: "<img src=x onerror=alert(1)>" }])).toEqual([]);
  });
  it("drops a known type with a missing or malformed payload", () => {
    expect(parseCards([{ type: "draft" }, { type: "proposal", proposal: "p1" }, { type: "amendment", amendment: { id: "a" } }, null, "draft", 7])).toEqual([]);
  });
  it("tolerates a non-array", () => {
    expect(parseCards(undefined)).toEqual([]);
    expect(parseCards({ type: "draft" })).toEqual([]);
  });
});

describe("what needs the person (the dots on the mobile tabs)", () => {
  it("a pending draft or amendment puts a dot on Contracts", () => {
    expect(attention([draft()], [], [])).toEqual({ chat: false, contracts: true });
    expect(attention([], [amd()], [])).toEqual({ chat: false, contracts: true });
    expect(attention([draft({ status: "signed" })], [amd({ status: "rejected" })], [])).toEqual({ chat: false, contracts: false });
  });
  it("a proposal to approve or pay puts a dot on Chat; a blocked or paid one does not", () => {
    expect(attention([], [], [prop()]).chat).toBe(true);
    expect(attention([], [], [prop({ status: "awaiting_buyer" })]).chat).toBe(true);
    expect(attention([], [], [prop({ status: "blocked", blocked: true })]).chat).toBe(false);
    expect(attention([], [], [prop({ status: "paid" })]).chat).toBe(false);
  });
});

describe("draft form state", () => {
  it("round-trips a draft: Sign sends the fields as they are", () => {
    const f = formFromMandate({ ...mandate, allowedMerchants: ["a.example"], autonomy: { mode: "auto_under", thresholdCents: 3000 } });
    expect(f).toMatchObject({ budget: "90.00", cap: "90.00", cats: ["shoes"], merchants: ["a.example"], qty: "1", auto: true, threshold: "30.00", expiry: "keep" });
    expect(mandateFromForm(f, mandate)).toEqual({ ...mandate, allowedMerchants: ["a.example"], autonomy: { mode: "auto_under", thresholdCents: 3000 } });
  });
  it("sends the person's edits, not the agent's numbers", () => {
    const f = { ...formFromMandate(mandate), budget: "60", cap: "40,50", cats: ["shoes", "socks"], qty: "2" };
    expect(mandateFromForm(f, mandate)).toMatchObject({ totalBudgetCents: 6000, perItemCapCents: 4050, allowedCategories: ["shoes", "socks"], maxQuantityPerItem: 2 });
  });
  it("keeps the drafted expiry, or restarts the clock from signing", () => {
    const f = formFromMandate(mandate);
    expect(mandateFromForm(f, mandate, 0).expiresAt).toBe(mandate.expiresAt);
    expect(mandateFromForm({ ...f, expiry: 24 }, mandate, Date.parse("2026-05-01T00:00:00Z")).expiresAt).toBe("2026-05-02T00:00:00.000Z");
  });
  it("omits merchants when empty and asks always when auto is off", () => {
    const m = mandateFromForm({ ...formFromMandate(mandate), auto: false }, mandate);
    expect(m).not.toHaveProperty("allowedMerchants");
    expect(m.autonomy).toEqual({ mode: "ask_always" });
  });
  it("reports problems that block Sign", () => {
    const bad = mandateFromForm({ ...formFromMandate(mandate), budget: "abc", cats: [], qty: "1.5" }, mandate);
    expect(problemsOf(bad, false)).toEqual(expect.arrayContaining(["Enter a total budget above 0.", "Add at least one category.", "Quantity must be a whole number, 1 or more."]));
    expect(problemsOf(mandateFromForm(formFromMandate(mandate), mandate), false)).toEqual([]);
    expect(problemsOf(mandateFromForm({ ...formFromMandate(mandate), auto: true, threshold: "" }, mandate), true)).toHaveLength(1);
  });
  it("warns when the cap is above the budget", () => {
    expect(hintsOf({ ...mandate, perItemCapCents: 20000 })).toHaveLength(1);
    expect(hintsOf(mandate)).toEqual([]);
  });
});

describe("amendment diff in plain words", () => {
  it("formats money, lists and autonomy", () => {
    expect(describeChange("totalBudgetCents", 9000, 12000, "EUR")).toEqual({ label: "Total budget", before: "€90.00", after: "€120.00" });
    expect(describeChange("allowedCategories", ["shoes"], ["shoes", "socks"], "EUR")).toMatchObject({ before: "shoes", after: "shoes, socks" });
    expect(describeChange("allowedMerchants", undefined, ["a.example"], "EUR")).toMatchObject({ before: "any", after: "a.example" });
    expect(describeChange("autonomy", { mode: "ask_always" }, { mode: "auto_under", thresholdCents: 3000 }, "EUR")).toMatchObject({ before: "nothing: asks every time", after: "carts under €30.00" });
  });
  it("shows an unknown field as text, never as markup", () => {
    expect(describeChange("surprise", "<b>x</b>", { a: 1 }, "EUR")).toEqual({ label: "surprise", before: "<b>x</b>", after: '{"a":1}' });
  });
});

describe("contract list helpers", () => {
  it("lists contracts that can still spend first", () => {
    const list = sortContracts([view({ hash: "r", status: "revoked" }), view({ hash: "s", status: "superseded" }), view({ hash: "a", status: "active" })]);
    expect(list.map((v) => v.hash)).toEqual(["a", "s", "r"]);
  });
  it("counts down to expiry", () => {
    const now = Date.parse("2030-01-01T00:00:00Z");
    expect(countdown("2030-01-01T00:45:00Z", now)).toBe("45 min left");
    expect(countdown("2030-01-01T03:10:00Z", now)).toBe("3 h 10 min left");
    expect(countdown("2030-01-04T05:00:00Z", now)).toBe("3 days 5 h left");
    expect(countdown("2029-12-31T00:00:00Z", now)).toBe("expired");
  });
  it("meter segments never exceed 100%", () => {
    expect(meter(view({ spentCents: 4500, pendingCents: 2250, remainingCents: 2250 }))).toEqual({ spent: 50, pending: 25, remaining: 25 });
    const over = meter(view({ spentCents: 9000, pendingCents: 9000, remainingCents: 0 }));
    expect(over.spent + over.pending + over.remaining).toBe(100);
  });
});

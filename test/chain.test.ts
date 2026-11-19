import { describe, expect, it } from "vitest";
import { checkCart } from "../src/mandate/check.js";
import { ancestry, type MandateRecord } from "../src/mandate/chain.js";
import { signMandate } from "../src/mandate/sign.js";
import type { CartLine, Mandate } from "../src/mandate/types.js";

const NOW = new Date("2026-11-12T10:00:00Z");
const base: Mandate = {
  currency: "EUR", totalBudgetCents: 9000, perItemCapCents: 9000, allowedCategories: ["shoes"], maxQuantityPerItem: 1,
  expiresAt: "2026-11-12T18:00:00Z", autonomy: { mode: "ask_always" },
};
const line: CartLine = {
  productId: "p1", title: "Futsal shoe", merchant: "shoplux", category: "shoes", unitPriceCents: 8000, quantity: 1, currency: "EUR",
  attributes: {}, priceCheckedAt: "2026-11-12T09:58:00Z", injectionFlag: false,
};
const record = (m: Mandate): MandateRecord => ({ signed: signMandate(m), status: "active", signedAt: NOW.toISOString() });

describe("mandate_active guardrail", () => {
  it("passes for an active mandate and fails for a revoked or superseded one", () => {
    const status = (s?: "active" | "revoked" | "superseded") => checkCart(base, { lines: [line] }, NOW, { status: s }).find((r) => r.name === "mandate_active")!;
    expect(status().ok).toBe(true);
    expect(status("active").ok).toBe(true);
    expect(status("revoked")).toMatchObject({ ok: false, reason: expect.stringContaining("revoked") });
    expect(status("superseded")).toMatchObject({ ok: false, reason: expect.stringContaining("superseded") });
  });
  it("is the eleventh named check, last in the fixed order", () => {
    const names = checkCart(base, { lines: [line] }, NOW).map((r) => r.name);
    expect(names).toHaveLength(11);
    expect(names.at(-1)).toBe("mandate_active");
  });
});

describe("ancestry: the contracts whose spend counts against a mandate", () => {
  it("is just the mandate itself when nothing was superseded", () => {
    const a = record(base);
    expect(ancestry(new Map([[a.signed.hash, a]]), a.signed.hash)).toEqual([a.signed.hash]);
  });
  it("walks supersedes from the newest contract back to the first", () => {
    const a = record(base);
    const b = record({ ...base, totalBudgetCents: 20000, supersedes: a.signed.hash });
    const c = record({ ...base, totalBudgetCents: 30000, supersedes: b.signed.hash });
    const all = new Map([a, b, c].map((r) => [r.signed.hash, r]));
    expect(ancestry(all, c.signed.hash)).toEqual([c.signed.hash, b.signed.hash, a.signed.hash]);
    expect(ancestry(all, a.signed.hash)).toEqual([a.signed.hash]);
  });
  it("stops at an unknown parent and never loops", () => {
    const orphan = record({ ...base, supersedes: "000000000000" });
    expect(ancestry(new Map([[orphan.signed.hash, orphan]]), orphan.signed.hash)).toEqual([orphan.signed.hash]);
    const loop = { signed: { mandate: { ...base, supersedes: "loop" }, hash: "loop" }, status: "active" as const, signedAt: "" };
    expect(ancestry(new Map([["loop", loop]]), "loop")).toEqual(["loop"]);
  });
});

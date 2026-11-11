import { describe, expect, it } from "vitest";
import { checkCart } from "../src/mandate/check.js";
import { signMandate, verifyMandate } from "../src/mandate/sign.js";
import type { Cart, CartLine, CheckName, Mandate } from "../src/mandate/types.js";

const NOW = new Date("2026-11-12T10:00:00Z");
const mandate: Mandate = {
  currency: "EUR",
  totalBudgetCents: 9000,
  perItemCapCents: 9000,
  allowedCategories: ["shoes"],
  maxQuantityPerItem: 1,
  expiresAt: "2026-11-12T18:00:00Z",
  autonomy: { mode: "ask_always" },
};
const line = (over: Partial<CartLine> = {}): CartLine => ({
  productId: "p1", title: "Futsal shoe", merchant: "shoplux", category: "shoes",
  unitPriceCents: 8000, quantity: 1, currency: "EUR", attributes: { size: "43" },
  priceCheckedAt: "2026-11-12T09:58:00Z", injectionFlag: false, ...over,
});
const cart = (...lines: CartLine[]): Cart => ({ lines });
const ok = (m: Mandate, c: Cart, name: CheckName, now = NOW) => checkCart(m, c, now).find((r) => r.name === name)!.ok;

describe("checkCart: one test per check, pass and fail", () => {
  it("per_item_cap", () => {
    const m = { ...mandate, perItemCapCents: 5000 };
    expect(ok(m, cart(line({ unitPriceCents: 5000 })), "per_item_cap")).toBe(true);
    expect(ok(m, cart(line({ unitPriceCents: 5001 })), "per_item_cap")).toBe(false);
  });
  it("category", () => {
    expect(ok(mandate, cart(line({ category: "shoes" })), "category")).toBe(true);
    expect(ok(mandate, cart(line({ category: "electronics" })), "category")).toBe(false);
  });
  it("merchant: empty allowlist allows any, otherwise enforced", () => {
    expect(ok(mandate, cart(line({ merchant: "anyone" })), "merchant")).toBe(true);
    const m = { ...mandate, allowedMerchants: ["shoplux"] };
    expect(ok(m, cart(line()), "merchant")).toBe(true);
    expect(ok(m, cart(line({ merchant: "scamshop" })), "merchant")).toBe(false);
  });
  it("quantity", () => {
    expect(ok(mandate, cart(line({ quantity: 1 })), "quantity")).toBe(true);
    expect(ok(mandate, cart(line({ quantity: 10 })), "quantity")).toBe(false);
    expect(ok(mandate, cart(line({ quantity: 0 })), "quantity")).toBe(false);
    expect(ok(mandate, cart(line({ quantity: 1.5 })), "quantity")).toBe(false);
  });
  it("expiry", () => {
    expect(ok(mandate, cart(line()), "expiry")).toBe(true);
    expect(ok(mandate, cart(line()), "expiry", new Date("2026-11-12T18:00:00Z"))).toBe(false);
    expect(ok({ ...mandate, expiresAt: "garbage" }, cart(line()), "expiry")).toBe(false);
  });
  it("currency", () => {
    expect(ok(mandate, cart(line()), "currency")).toBe(true);
    expect(ok(mandate, cart(line({ currency: "USD" })), "currency")).toBe(false);
  });
  it("hard_attributes", () => {
    const c = (l: CartLine): Cart => ({ lines: [l], requiredAttributes: { size: "43" } });
    expect(ok(mandate, c(line()), "hard_attributes")).toBe(true);
    expect(ok(mandate, c(line({ attributes: { size: "42" } })), "hard_attributes")).toBe(false);
    expect(ok(mandate, c(line({ attributes: {} })), "hard_attributes")).toBe(false);
  });
  it("price_freshness", () => {
    expect(ok(mandate, cart(line({ priceCheckedAt: "2026-11-12T09:50:00Z" })), "price_freshness")).toBe(true);
    expect(ok(mandate, cart(line({ priceCheckedAt: "2026-11-12T09:49:59Z" })), "price_freshness")).toBe(false);
    expect(ok(mandate, cart(line({ priceCheckedAt: "nope" })), "price_freshness")).toBe(false);
  });
  it("injection_flag", () => {
    expect(ok(mandate, cart(line()), "injection_flag")).toBe(true);
    expect(ok(mandate, cart(line({ injectionFlag: true })), "injection_flag")).toBe(false);
  });
  it("an empty cart passes (nothing to pay)", () => {
    expect(checkCart(mandate, cart(), NOW).every((r) => r.ok)).toBe(true);
  });
});

describe("signMandate", () => {
  it("hash is stable under key order and changes with any field", () => {
    const a = signMandate(mandate);
    const reordered = Object.fromEntries(Object.entries(mandate).reverse()) as Mandate;
    expect(signMandate(reordered).hash).toBe(a.hash);
    expect(a.hash).toMatch(/^[0-9a-f]{12}$/);
    expect(signMandate({ ...mandate, totalBudgetCents: 9001 }).hash).not.toBe(a.hash);
    expect(verifyMandate(a)).toBe(true);
    expect(verifyMandate({ mandate: { ...mandate, totalBudgetCents: 99999 }, hash: a.hash })).toBe(false);
  });
});

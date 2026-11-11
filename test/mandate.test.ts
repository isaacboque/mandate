import { describe, expect, it } from "vitest";
import { checkCart } from "../src/mandate/check.js";
import type { Cart, CartLine, Mandate } from "../src/mandate/types.js";

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
const result = (m: Mandate, c: Cart, name: string) => checkCart(m, c, NOW).find((r) => r.name === name)!;

describe("checkCart", () => {
  it("passes every check for a cart inside the mandate", () => {
    const r = checkCart(mandate, cart(line()), NOW);
    expect(r).toHaveLength(10);
    expect(r.every((x) => x.ok)).toBe(true);
  });

  it("total_budget: fails when the cart total exceeds the budget", () => {
    expect(result(mandate, cart(line({ unitPriceCents: 9000 })), "total_budget").ok).toBe(true);
    const over = result(mandate, cart(line({ unitPriceCents: 5000 }), line({ productId: "p2", unitPriceCents: 4001 })), "total_budget");
    expect(over.ok).toBe(false);
    expect(over.reason).toContain("90.01");
  });
});

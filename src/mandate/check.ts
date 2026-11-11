import { formatCents } from "../core/money.js";
import type { Cart, CheckName, CheckResult, Mandate } from "./types.js";

/** A price read from the catalog older than this is stale and must be re-read before paying. */
export const MAX_PRICE_AGE_MS = 10 * 60 * 1000;

/**
 * Pure, deterministic guardrails. Always returns one result per check name, in a fixed order.
 * Nothing here calls a model: a poisoned listing cannot talk its way past these.
 */
export function checkCart(mandate: Mandate, cart: Cart, now: Date): CheckResult[] {
  const out: CheckResult[] = [];
  const add = (name: CheckName, bad: string[], good: string) =>
    out.push({ name, ok: bad.length === 0, reason: bad.length === 0 ? good : bad.join("; ") });
  const lines = cart.lines;
  const fmt = (c: number) => formatCents(c, mandate.currency);

  const total = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  add("total_budget", total > mandate.totalBudgetCents ? [`total ${fmt(total)} is over the budget ${fmt(mandate.totalBudgetCents)}`] : [],
    `total ${fmt(total)} within budget ${fmt(mandate.totalBudgetCents)}`);

  add("per_item_cap", lines.filter((l) => l.unitPriceCents > mandate.perItemCapCents)
    .map((l) => `${l.productId} costs ${fmt(l.unitPriceCents)}, cap is ${fmt(mandate.perItemCapCents)}`), "every item within the per-item cap");

  add("category", lines.filter((l) => !mandate.allowedCategories.includes(l.category))
    .map((l) => `${l.productId} is in category "${l.category}", not allowed`), "all categories allowed");

  const merchants = mandate.allowedMerchants ?? [];
  add("merchant", merchants.length === 0 ? [] : lines.filter((l) => !merchants.includes(l.merchant))
    .map((l) => `${l.productId} is sold by "${l.merchant}", not on the allowlist`), merchants.length === 0 ? "any merchant allowed" : "all merchants allowed");

  add("quantity", lines.filter((l) => !Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > mandate.maxQuantityPerItem)
    .map((l) => `${l.productId} quantity ${l.quantity} is outside 1..${mandate.maxQuantityPerItem}`), "quantities within the limit");

  const expires = Date.parse(mandate.expiresAt);
  add("expiry", !(now.getTime() < expires) ? [`mandate expired at ${mandate.expiresAt}`] : [], `valid until ${mandate.expiresAt}`);

  add("currency", [...(mandate.currency ? [] : ["mandate has no currency"]),
    ...lines.filter((l) => l.currency !== mandate.currency).map((l) => `${l.productId} is priced in ${l.currency}, mandate is ${mandate.currency}`)],
    `all prices in ${mandate.currency}`);

  const required = Object.entries(cart.requiredAttributes ?? {});
  add("hard_attributes", lines.flatMap((l) => required.filter(([k, v]) => l.attributes[k] !== v)
    .map(([k, v]) => `${l.productId} has ${k}=${l.attributes[k] ?? "missing"}, need ${v}`)), "required attributes match");

  add("price_freshness", lines.filter((l) => {
    const age = now.getTime() - Date.parse(l.priceCheckedAt);
    return !Number.isFinite(age) || age > MAX_PRICE_AGE_MS || age < 0;
  }).map((l) => `${l.productId} price was last checked at ${l.priceCheckedAt}`), "prices are fresh");

  add("injection_flag", lines.filter((l) => l.injectionFlag).map((l) => `${l.productId} listing looks like a prompt injection`), "no injection flags");

  return out;
}

export const allPass = (results: CheckResult[]) => results.every((r) => r.ok);

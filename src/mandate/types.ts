import type { Cents } from "../core/money.js";

export type Autonomy = { mode: "ask_always" } | { mode: "auto_under"; thresholdCents: Cents };

export type Mandate = {
  currency: string;
  totalBudgetCents: Cents;
  perItemCapCents: Cents;
  allowedCategories: string[];
  /** Empty or missing = any merchant. */
  allowedMerchants?: string[];
  maxQuantityPerItem: number;
  /** ISO timestamp. */
  expiresAt: string;
  autonomy: Autonomy;
};

export type CartLine = {
  productId: string;
  title: string;
  merchant: string;
  category: string;
  /** Categories from the root down to `category` (slugs). Allowing any of them allows the product. */
  categoryPath?: string[];
  unitPriceCents: Cents;
  quantity: number;
  currency: string;
  attributes: Record<string, string>;
  /** ISO timestamp of the last time the price was read from the catalog. */
  priceCheckedAt: string;
  /** Set by the catalog layer when the listing text looks like a prompt injection. */
  injectionFlag: boolean;
};

export type Cart = {
  lines: CartLine[];
  /** Hard attributes the buyer asked for, e.g. { size: "43" }. Every line must match all of them. */
  requiredAttributes?: Record<string, string>;
};

export type CheckName =
  | "total_budget" | "per_item_cap" | "category" | "merchant" | "quantity"
  | "expiry" | "currency" | "hard_attributes" | "price_freshness" | "injection_flag";

export type CheckResult = { name: CheckName; ok: boolean; reason: string };

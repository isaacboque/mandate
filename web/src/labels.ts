import type { Check } from "./api";

/** What a guardrail is called on screen. */
export const CHECK_LABEL: Record<Check["name"], string> = {
  total_budget: "Total budget", per_item_cap: "Per-item cap", category: "Category", merchant: "Merchant", quantity: "Quantity",
  expiry: "Mandate still valid", currency: "Currency", hard_attributes: "Required attributes", price_freshness: "Price is fresh", injection_flag: "Listing is clean", mandate_active: "Contract is active",
};

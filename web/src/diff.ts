import { money, type Mandate } from "./api";

const LABEL: Record<string, string> = {
  totalBudgetCents: "Total budget", perItemCapCents: "Per-item cap", allowedCategories: "Categories", allowedMerchants: "Shops",
  maxQuantityPerItem: "Max quantity per item", expiresAt: "Expires", autonomy: "May buy alone", currency: "Currency",
};

const list = (x: unknown) => (Array.isArray(x) && x.length ? x.join(", ") : "any");
const autonomy = (x: unknown, cur: string) => {
  const a = x as Mandate["autonomy"] | undefined;
  return a?.mode === "auto_under" ? `carts under ${money(a.thresholdCents, cur)}` : "nothing: asks every time";
};

/** One amendment field as a labelled before/after pair in plain words. Unknown fields fall back to JSON, never to HTML. */
export function describeChange(field: string, before: unknown, after: unknown, currency: string): { label: string; before: string; after: string } {
  const f = (v: unknown): string => {
    switch (field) {
      case "totalBudgetCents": case "perItemCapCents": return typeof v === "number" ? money(v, currency) : "none";
      case "allowedCategories": case "allowedMerchants": return list(v);
      case "maxQuantityPerItem": return String(v ?? "");
      case "expiresAt": return typeof v === "string" && Number.isFinite(Date.parse(v)) ? new Date(v).toLocaleString() : String(v ?? "");
      case "autonomy": return autonomy(v, currency);
      default: return typeof v === "string" ? v : JSON.stringify(v);
    }
  };
  return { label: LABEL[field] ?? field, before: f(before), after: f(after) };
}

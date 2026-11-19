import { toCents, type Mandate } from "./api";
import { formatMoneyInput } from "./moneyInput";

/** What the person sees and edits in a pending draft. Everything is text until it is turned into a mandate on Sign. */
export type FormState = {
  budget: string; cap: string; cats: string[]; merchants: string[]; qty: string;
  /** "keep" signs the draft's own expiry; a number of hours restarts the clock from the moment of signing. */
  expiry: "keep" | number; auto: boolean; threshold: string;
};

const eur = (c: number) => formatMoneyInput(c) ?? "";

export function formFromMandate(m: Mandate): FormState {
  return {
    budget: eur(m.totalBudgetCents), cap: eur(m.perItemCapCents), cats: m.allowedCategories, merchants: m.allowedMerchants ?? [], qty: String(m.maxQuantityPerItem),
    expiry: "keep", auto: m.autonomy.mode === "auto_under", threshold: m.autonomy.mode === "auto_under" ? eur(m.autonomy.thresholdCents) : "50",
  };
}

/** The fields exactly as the form holds them: what Sign sends. No field is added or hidden. */
export function mandateFromForm(f: FormState, base: Mandate, nowMs = Date.now()): Mandate {
  return {
    currency: base.currency,
    totalBudgetCents: toCents(f.budget),
    perItemCapCents: toCents(f.cap),
    allowedCategories: f.cats,
    ...(f.merchants.length ? { allowedMerchants: f.merchants } : {}),
    maxQuantityPerItem: Number(f.qty),
    expiresAt: f.expiry === "keep" ? base.expiresAt : new Date(nowMs + f.expiry * 3600_000).toISOString(),
    autonomy: f.auto ? { mode: "auto_under", thresholdCents: toCents(f.threshold) } : { mode: "ask_always" },
  };
}

export function problemsOf(m: Mandate, auto: boolean): string[] {
  const p: string[] = [];
  if (!(m.totalBudgetCents > 0)) p.push("Enter a total budget above 0.");
  if (!(m.perItemCapCents > 0)) p.push("Enter a per-item cap above 0.");
  if (m.allowedCategories.length === 0) p.push("Add at least one category.");
  if (!Number.isInteger(m.maxQuantityPerItem) || m.maxQuantityPerItem < 1) p.push("Quantity must be a whole number, 1 or more.");
  if (auto && !(m.autonomy.mode === "auto_under" && m.autonomy.thresholdCents > 0)) p.push("Enter the amount under which it may buy alone.");
  return p;
}

export function hintsOf(m: Mandate): string[] {
  const h: string[] = [];
  if (m.perItemCapCents > m.totalBudgetCents) h.push("The per-item cap is above the total budget, so the total is the real limit.");
  if (m.autonomy.mode === "auto_under" && m.autonomy.thresholdCents > m.totalBudgetCents) h.push("The auto-buy amount is above the total budget.");
  return h;
}

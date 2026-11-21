import type { AmendmentChanges } from "../service/types.js";

/**
 * Amendment scope. An amendment the agent proposes may change only the contract fields the person's message names. Seen live: "raise the
 * budget to 200 €" produced an amendment that raised the total budget AND the per-item cap. The person still had to sign and the diff showed
 * it, but the agent had changed a field they never named. This is a deterministic check in code; the prompt only tells the model the rule.
 */
export type AmendField = keyof AmendmentChanges;

const WORDS: [AmendField[], RegExp][] = [
  [["totalBudgetCents"], /\b(budget|total|overall|presupuesto)\b/i],
  [["perItemCapCents"], /\b(per[- ]?item|per[- ]?unit|per[- ]?pair|each|cap|por (?:art[ií]culo|unidad|par))\b/i],
  // "limit" on its own does not say which one: it names both money fields.
  [["totalBudgetCents", "perItemCapCents"], /\b(limits?|l[ií]mites?|spending)\b/i],
  [["allowedCategories"], /\b(categor(?:y|ies|[ií]as?)|socks?|shoes?|balls?|bags?|clothing|protection|shin guards?|jerseys?|any (?:category|kind)|everything)\b/i],
  [["allowedMerchants"], /\b(merchants?|shops?|stores?|sellers?|vendors?|tiendas?|comerciantes?)\b/i],
  [["maxQuantityPerItem"], /\b(quantit(?:y|ies)|units?|pairs?|copies|pieces|how many|cantidad|unidades)\b/i],
  [["expiresAt"], /\b(expir\w*|valid(?:ity)?|days?|hours?|weeks?|until|deadline|duration|extend|caduc\w*|vigencia|d[ií]as?|horas?)\b/i],
  [["autonomy"], /\b(autonom\w*|auto[- ]?(?:buy|approve|under)|without (?:asking|approval|confirm\w*)|don'?t ask|no need to ask|ask me|sin preguntar|buy (?:alone|by itself))\b/i],
];

/** The contract fields a message talks about. A field is named by its everyday words in English or Spanish; an unrelated message names none. */
export function fieldsNamedBy(text: string): Set<AmendField> {
  const out = new Set<AmendField>();
  for (const [fields, re] of WORDS) if (re.test(text)) for (const f of fields) out.add(f);
  return out;
}

/** The changed fields the message did not name. Empty means the amendment stays inside what the person asked for. */
export const scopeCreep = (changed: AmendField[], text: string): AmendField[] => {
  const named = fieldsNamedBy(text);
  return changed.filter((f) => !named.has(f));
};

export const FIELD_LABEL: Record<AmendField, string> = {
  totalBudgetCents: "total budget", perItemCapCents: "per-item cap", allowedCategories: "allowed categories", allowedMerchants: "allowed merchants",
  maxQuantityPerItem: "quantity per item", expiresAt: "expiry", autonomy: "autonomy",
};

import type { AmendmentChanges } from "../service/types.js";

/**
 * Amendment scope. An amendment the agent proposes may change only the contract fields the person's message names. Seen live: "raise the
 * budget to 200 €" produced an amendment that raised the total budget AND the per-item cap. The person still had to sign and the diff showed
 * it, but the agent had changed a field they never named. This is a deterministic check in code; the prompt only tells the model the rule.
 */
export type AmendField = keyof AmendmentChanges;

const WORDS: [AmendField[], RegExp][] = [
  [["totalBudgetCents"], /\b(budget|total|overall|presupuesto|pressupost|global)\b/i],
  [["perItemCapCents"], /\b(per[- ]?item|per[- ]?unit|per[- ]?pair|each|cap|por (?:art[ií]culo|unidad|par)|per (?:art[ií]cle|unitat|parell|producte)|cada|topall)\b/i],
  // "limit" on its own does not say which one: it names both money fields.
  [["totalBudgetCents", "perItemCapCents"], /\b(limits?|l[ií]mites?|l[ií]mits?|spending|despes(?:a|es))\b/i],
  [["allowedCategories"], /\b(categor(?:y|ies|[ií]as?|ia)|socks?|shoes?|balls?|bags?|clothing|protection|shin guards?|jerseys?|any (?:category|kind)|everything|mitjons?|sabat(?:a|es)|sabatilles?|pilotes?|bosses?|roba|protecci|canelleres?|samarretes?|qualsevol categoria)\b/i],
  [["allowedMerchants"], /\b(merchants?|shops?|stores?|sellers?|vendors?|tiendas?|comerciantes?|botigues?|botiga|venedors?|comer[cç]os?)\b/i],
  [["maxQuantityPerItem"], /\b(quantit(?:y|ies)|units?|pairs?|copies|pieces|how many|cantidad|unidades|quantitat|unitats?|parells?|c[oò]pies|peces|quantes)\b/i],
  [["expiresAt"], /\b(expir\w*|valid(?:ity)?|days?|hours?|weeks?|until|deadline|duration|extend|caduc\w*|vigencia|d[ií]as?|horas?|venciment|validesa|vig[eè]ncia|dies|hores|setmanes?|termini|durada|allarga|amplia|pr[oò]rroga)\b/i],
  [["autonomy"], /\b(autonom\w*|auto[- ]?(?:buy|approve|under)|without (?:asking|approval|confirm\w*)|don'?t ask|no need to ask|ask me|sin preguntar|buy (?:alone|by itself)|sense (?:preguntar|demanar|confirm\w*|aprov\w*)|no (?:em )?pregunt\w*|compra (?:sol|sola|per si mateix))\b/i],
];

/** The contract fields a message talks about. A field is named by its everyday words in English, Spanish or Catalan; an unrelated message names none. */
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

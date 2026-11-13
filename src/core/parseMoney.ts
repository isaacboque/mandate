/**
 * Forgiving money input (Postel's law: accept what people type, show back one clean value).
 * Reads "90", "90€", "€90", "90 eur", "90,00", "1.234,56", "1,234.56" into integer cents.
 * Returns NaN when the text is not an amount. Never guesses between two readings that change
 * the value: a lone "1,234" is a thousand, "1,23" is one euro and 23 cents.
 */
const CURRENCY_WORDS = /euros?|eur|usd|gbp|dollars?|pounds?/gi;
const GROUPED = /^\d{1,3}$/;

export function parseMoney(text: string): number {
  const t = text.replace(CURRENCY_WORDS, "").replace(/[€$£\s\u00a0\u202f]/g, "");
  if (!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return NaN;

  const thousands = (parts: string[]) => GROUPED.test(parts[0]) && parts.slice(1).every((p) => p.length === 3);
  let normalised: string;
  const lastComma = t.lastIndexOf(","), lastDot = t.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalAt = Math.max(lastComma, lastDot);
    const sep = t[decimalAt] === "," ? "." : ",";
    const intParts = t.slice(0, decimalAt).split(sep);
    const fraction = t.slice(decimalAt + 1);
    if (!thousands(intParts) || intParts.some((p) => /[.,]/.test(p)) || /[.,]/.test(fraction)) return NaN;
    normalised = `${intParts.join("")}.${fraction}`;
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = t.split(sep);
    if (parts.length > 2) {
      if (!thousands(parts)) return NaN;
      normalised = parts.join("");
    } else if (parts[1].length === 3 && GROUPED.test(parts[0]) && Number(parts[0]) > 0) {
      normalised = parts.join("");
    } else {
      normalised = `${parts[0] || "0"}.${parts[1]}`;
    }
  } else {
    normalised = t;
  }
  const n = Number(normalised);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

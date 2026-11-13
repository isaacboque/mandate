/**
 * Forgiving money input (Postel's law: accept what people type, show back one clean value).
 * Reads "90", "90€", "€90", "90 eur", "90,00", "1.234,56", "1,234.56" into integer cents.
 * Returns NaN when the text is not an amount. One documented guess: three digits after a lone separator
 * ("1,234", "1.234") read as thousands, two or fewer ("1,23") as decimals. The form shows the clean value back on blur,
 * so a wrong guess is visible before signing. Spaces count only as thousands groups of exactly three digits ("1 234,50").
 */
const CURRENCY_WORDS = /euros?|eur|usd|gbp|dollars?|pounds?/gi;
const GROUPED = /^\d{1,3}$/;

export function parseMoney(text: string): number {
  const stripped = text.replace(CURRENCY_WORDS, " ").replace(/[€$£]/g, " ").trim();
  // A space between digits is a thousands separator only before a group of exactly three digits ("1 234"); "9 0" or "90 50" is not an amount.
  const t = stripped.replace(/(?<=\d)[   ](?=\d{3}(?!\d))/g, "");
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

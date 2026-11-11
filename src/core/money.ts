// Money is always an integer number of cents.
export type Cents = number;

export function assertCents(value: number, label = "amount"): Cents {
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer number of cents, got ${value}`);
  return value;
}

/** "12.34" | "12,34" | "12" | 12.34 → 1234. Rejects more than 2 decimals. */
export function parseCents(input: string | number): Cents {
  const raw = typeof input === "number" ? input.toString() : input.trim().replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(raw)) throw new Error(`Not a money amount: "${input}"`);
  const negative = raw.startsWith("-");
  const [whole, frac = ""] = raw.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return negative ? -cents : cents;
}

export function formatCents(cents: Cents, currency = "EUR"): string {
  assertCents(cents);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")} ${currency}`;
}

// One parser for the form and for the server's rules reader (src/core/parseMoney.ts).
export { parseMoney } from "../../src/core/parseMoney";

/** The clean value shown back in the field: "90.00". Undefined when the typed text is not an amount. */
export function formatMoneyInput(cents: number): string | undefined {
  return Number.isFinite(cents) ? (cents / 100).toFixed(2) : undefined;
}

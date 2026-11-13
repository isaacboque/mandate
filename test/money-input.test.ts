import { describe, expect, it } from "vitest";
import { parseMoney, formatMoneyInput } from "../web/src/moneyInput.js";

describe("forgiving money input (Postel)", () => {
  it.each([
    ["90", 9000], ["90€", 9000], ["€90", 9000], ["€ 90", 9000], ["90 eur", 9000], ["90 EUR", 9000], ["90 euros", 9000],
    ["$90", 9000], ["£90.5", 9050], ["90,00", 9000], ["90.00", 9000], ["90,5", 9050], ["0,99", 99], [".5", 50], [" 90 ", 9000],
    ["1.234,56", 123456], ["1,234.56", 123456], ["1,234", 123400], ["1.234", 123400], ["12,345,678", 1234567800], ["1 234,50 €", 123450], ["1\u00a0234,50", 123450],
  ])("reads %j as %i cents", (typed, cents) => {
    expect(parseMoney(typed)).toBe(cents);
  });

  it.each(["", "   ", "abc", "€", "-5", "9 0 0x", "1,2,3", "90,00,00", "NaN", "Infinity", "1e3"])("rejects %j", (typed) => {
    expect(Number.isNaN(parseMoney(typed))).toBe(true);
  });

  it("shows a clean normalised value back", () => {
    expect(formatMoneyInput(9000)).toBe("90.00");
    expect(formatMoneyInput(9050)).toBe("90.50");
    expect(formatMoneyInput(99)).toBe("0.99");
    expect(formatMoneyInput(NaN)).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { currencyInputToNumber, formatCurrencyInput, formatCurrencyValue } from "../client/src/lib/currency";

describe("currency input mask", () => {
  it.each([
    ["1", "0,01"],
    ["10", "0,10"],
    ["100", "1,00"],
    ["1000", "10,00"],
    ["35678", "356,78"],
    ["1234567", "12.345,67"],
  ])("formats typed digits as cents: %s", (typed, expected) => {
    expect(formatCurrencyInput(typed)).toBe(expected);
  });

  it("keeps formatting stable while the user continues typing", () => {
    expect(formatCurrencyInput("1,00" + "0")).toBe("10,00");
  });

  it("formats existing numeric values for editing", () => {
    expect(formatCurrencyValue(356.78)).toBe("356,78");
    expect(formatCurrencyValue(-1250)).toBe("-1.250,00");
  });

  it("converts the formatted value back to a number", () => {
    expect(currencyInputToNumber("12.345,67")).toBe(12345.67);
    expect(currencyInputToNumber("-10,00")).toBe(-10);
  });
});

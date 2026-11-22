import { describe, expect, it } from "vitest";
import { splitBold } from "../web/src/inlineBold.js";

// The live demo showed "**Total budget:**" with its asterisks. Only bold is rendered, as text parts, never as HTML.
describe("splitBold", () => {
  it("turns **x** into a bold part", () => {
    expect(splitBold("a **b** c")).toEqual([{ text: "a " }, { text: "b", bold: true }, { text: " c" }]);
  });
  it("handles several spans and the start of the text", () => {
    expect(splitBold("**a** and **b**")).toEqual([{ text: "a", bold: true }, { text: " and " }, { text: "b", bold: true }]);
  });
  it("leaves an unmatched marker as it is", () => {
    expect(splitBold("5 ** 2 and **open")).toEqual([{ text: "5 ** 2 and **open" }]);
  });
  it("never produces markup: angle brackets stay text", () => {
    expect(splitBold("**<b>x</b>**")).toEqual([{ text: "<b>x</b>", bold: true }]);
  });
  it("returns plain text unchanged", () => {
    expect(splitBold("no marks")).toEqual([{ text: "no marks" }]);
    expect(splitBold("")).toEqual([]);
  });
});

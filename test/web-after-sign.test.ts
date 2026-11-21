import { describe, expect, it } from "vitest";
import { parseCards } from "../web/src/cards.js";
import { stepHint, STEPS } from "../web/src/stepper.js";

describe("the inline note card", () => {
  it("is a typed, validated shape", () => {
    expect(parseCards([{ type: "note", message: "The cart above is ready to review." }]).map((c) => c.type)).toEqual(["note"]);
    expect(parseCards([{ type: "note" }, { type: "note", message: 3 }])).toEqual([]);
  });
});

describe("the tour step after signing", () => {
  it("step 3 stays 'Approve and pay'; with a cart waiting, its hint points at it", () => {
    expect(STEPS.find((s) => s.id === "buy")!.label).toBe("Approve and pay");
    expect(stepHint("buy", false)).toMatch(/Approve the proposed cart/);
    expect(stepHint("buy", true)).toBe("Approve the cart above.");
    expect(stepHint("sign", true)).toBe(STEPS.find((s) => s.id === "sign")!.hint);
  });
});

import { describe, expect, it } from "vitest";
import { humanize, normalizeCategory, normalizeShop } from "../web/src/TagInput.js";

describe("category and shop input normalisation", () => {
  it("turns what a person types into the catalog's own slug", () => {
    expect(normalizeCategory("Athletic Shoes")).toBe("athletic-shoes");
    expect(normalizeCategory("  in_ear headphones ")).toBe("in-ear-headphones");
    expect(normalizeCategory("shoes!!")).toBe("shoes");
    expect(normalizeCategory("--")).toBe("");
  });
  it("reduces a pasted shop URL to its domain", () => {
    expect(normalizeShop("https://www.Shoebacca.com/products/x?y=1")).toBe("shoebacca.com");
    expect(normalizeShop("dickssportinggoods.com")).toBe("dickssportinggoods.com");
    expect(normalizeShop("  ")).toBe("");
  });
  it("shows a readable label for a slug", () => {
    expect(humanize("athletic-shoes")).toBe("Athletic shoes");
    expect(humanize("in-ear-headphones")).toBe("In ear headphones");
  });
});

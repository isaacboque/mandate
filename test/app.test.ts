import { describe, expect, it } from "vitest";
import { createApp } from "../src/server/app.js";
import { formatCents, parseCents } from "../src/core/money.js";

describe("api", () => {
  it("health and config", async () => {
    const app = createApp({ demoMode: "mock", currency: "EUR" });
    expect(await (await app.request("/api/health")).json()).toEqual({ ok: true });
    expect(await (await app.request("/api/config")).json()).toEqual({ demoMode: "mock", currency: "EUR" });
  });
});

describe("money", () => {
  it("parses and formats integer cents", () => {
    expect(parseCents("12,34")).toBe(1234);
    expect(formatCents(1234)).toBe("12.34 EUR");
    expect(() => parseCents("1.234")).toThrow();
  });
});

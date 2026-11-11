import { describe, expect, it } from "vitest";
import { formatCents, parseCents } from "../src/core/money.js";
import { configFromEnv } from "../src/server/app.js";
import { serviceFromEnv } from "../src/server/deps.js";

describe("config", () => {
  it("defaults to mock mode and EUR", () => {
    expect(configFromEnv({})).toEqual({ demoMode: "mock", currency: "EUR" });
    expect(configFromEnv({ DEMO_MODE: "live", CURRENCY: "USD" })).toEqual({ demoMode: "live", currency: "USD" });
  });
  it("mock mode needs no keys and uses the rules agent", () => {
    const { service } = serviceFromEnv({});
    expect(service.isMock).toBe(true);
    expect(service.agentMode).toBe("rules");
  });
});

describe("money", () => {
  it("parses and formats integer cents", () => {
    expect(parseCents("12,34")).toBe(1234);
    expect(formatCents(1234)).toBe("12.34 EUR");
    expect(() => parseCents("1.234")).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { formatCents, parseCents } from "../src/core/money.js";
import { configFromEnv } from "../src/server/app.js";
import { serviceFromEnv } from "../src/server/deps.js";

describe("config", () => {
  it("defaults to mock mode and EUR", () => {
    expect(configFromEnv({})).toEqual({ demoMode: "mock", currency: "EUR", trustedProxies: 0, siteOrigin: "https://isaacboque.github.io" });
    expect(configFromEnv({ DEMO_MODE: "live", CURRENCY: "USD" })).toEqual({ demoMode: "live", currency: "USD", trustedProxies: 0, siteOrigin: "https://isaacboque.github.io" });
  });
  it("TRUSTED_PROXIES is a whole number of proxies; anything else means none", () => {
    expect(configFromEnv({ TRUSTED_PROXIES: "1" }).trustedProxies).toBe(1);
    expect(configFromEnv({ TRUSTED_PROXIES: "2" }).trustedProxies).toBe(2);
    for (const bad of ["", "abc", "-1", "1.5", "0"]) expect(configFromEnv({ TRUSTED_PROXIES: bad }).trustedProxies).toBe(0);
  });
  it("mock mode needs no keys and uses the rules agent", () => {
    const service = serviceFromEnv({}).makeService("t");
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

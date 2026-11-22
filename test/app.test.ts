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

describe("per-visitor limits on the public demo", () => {
  const hits = (l: { hit(ip: string): { ok: boolean } }, n: number, ip = "1.1.1.1") => Array.from({ length: n }, () => l.hit(ip).ok);
  it("mock mode with no model stays unlimited", () => {
    const { limiter, categoryLimiter } = serviceFromEnv({});
    expect(limiter.enabled).toBe(false);
    expect(categoryLimiter.enabled).toBe(false);
  });
  it("mock mode with a model limits one visitor to 10 per hour, and the day to the model turn budget", () => {
    const { limiter } = serviceFromEnv({ GROQ_API_KEY: "gsk_fake", LLM_PROVIDER: "groq" });
    expect(limiter.enabled).toBe(true);
    expect(hits(limiter, 10).every(Boolean)).toBe(true);
    expect(limiter.hit("1.1.1.1")).toMatchObject({ ok: false, message: expect.stringContaining("10 searches per hour") });
    expect(limiter.hit("2.2.2.2").ok).toBe(true); // another visitor is not affected
  });
  it("the daily cap defaults to LLM_DAILY_TURN_BUDGET", () => {
    const { limiter } = serviceFromEnv({ GROQ_API_KEY: "gsk_fake", LLM_DAILY_TURN_BUDGET: "3", RATE_LIMIT_ASKS_PER_HOUR: "0" });
    expect(hits(limiter, 3, "a")).toEqual([true, true, true]);
    expect(limiter.hit("b")).toMatchObject({ ok: false, message: expect.stringContaining("Demo limit reached for today") });
  });
  it("explicit values win, and 0 turns a limit off", () => {
    const env = { GROQ_API_KEY: "gsk_fake" };
    expect(hits(serviceFromEnv({ ...env, RATE_LIMIT_ASKS_PER_HOUR: "2" }).limiter, 3)).toEqual([true, true, false]);
    const off = serviceFromEnv({ ...env, RATE_LIMIT_ASKS_PER_HOUR: "0", DAILY_ASK_CAP: "0" }).limiter;
    expect(off.enabled).toBe(false);
  });
  it("live mode keeps its own defaults", () => {
    const { limiter } = serviceFromEnv({ DEMO_MODE: "live", CHANNEL3_API_KEY: "fake", PAYPAL_CLIENT_ID: "fake", PAYPAL_CLIENT_SECRET: "fake" });
    expect(hits(limiter, 13).filter(Boolean)).toHaveLength(12);
  });
});

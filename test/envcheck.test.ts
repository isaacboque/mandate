import { describe, expect, it } from "vitest";
import { checkEnv } from "../src/server/envcheck.js";

const text = (r: ReturnType<typeof checkEnv>) => r.lines.join("\n");

describe("npm run doctor: is the environment ready, and what will answer?", () => {
  it("a bare checkout is fine: demo mode, offline agent, nothing required", () => {
    const r = checkEnv({});
    expect(r.ok).toBe(true);
    expect(text(r)).toMatch(/demo mode/i);
    expect(text(r)).toMatch(/offline agent/i);
  });

  it("a key for any provider is enough, and the line says which model will answer", () => {
    const r = checkEnv({ OPENAI_API_KEY: "sk-secret-123456" });
    expect(r.ok).toBe(true);
    expect(text(r)).toMatch(/openai \/ gpt-4\.1-mini/);
    expect(text(r)).not.toContain("sk-secret-123456");
  });

  it("a provider chosen without its key is a problem, with the variable to set", () => {
    const r = checkEnv({ LLM_PROVIDER: "groq", OPENAI_API_KEY: "o" });
    expect(r.ok).toBe(false);
    expect(text(r)).toMatch(/GROQ_API_KEY/);
  });

  it("live mode needs the catalog and PayPal sandbox variables, and names each missing one", () => {
    const r = checkEnv({ DEMO_MODE: "live" });
    expect(r.ok).toBe(false);
    for (const v of ["CHANNEL3_API_KEY", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"]) expect(text(r)).toContain(v);
    expect(checkEnv({ DEMO_MODE: "live", CHANNEL3_API_KEY: "a", PAYPAL_CLIENT_ID: "b", PAYPAL_CLIENT_SECRET: "c" }).ok).toBe(true);
  });

  it("only shows whether a secret is set, never its value", () => {
    const secret = "gsk_very_secret_value_0123456789";
    const r = checkEnv({ GROQ_API_KEY: secret, DEMO_MODE: "live", PAYPAL_CLIENT_SECRET: secret, PAYPAL_CLIENT_ID: "id-123", CHANNEL3_API_KEY: secret });
    expect(text(r)).not.toContain(secret);
    expect(text(r)).not.toContain("id-123");
  });

  it("flags values that cannot work: a daily budget or a timeout that is not a number", () => {
    expect(checkEnv({ LLM_DAILY_TURN_BUDGET: "lots" }).ok).toBe(false);
    expect(checkEnv({ LLM_TIMEOUT_SECONDS: "-3" }).ok).toBe(false);
    expect(checkEnv({ LLM_DAILY_TURN_BUDGET: "0", LLM_TIMEOUT_SECONDS: "60" }).ok).toBe(true);
  });
});

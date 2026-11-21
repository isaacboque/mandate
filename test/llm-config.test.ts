import { describe, expect, it } from "vitest";
import { describeLlm, hasLlmKey, llmStartupLine, modelFromEnv, resolveLlm } from "../src/llm/model.js";

describe("bring your own key: the environment alone decides, and it just works", () => {
  it("no key: no model (the offline agent answers)", () => {
    expect(resolveLlm({})).toEqual({ status: "none" });
    expect(hasLlmKey({})).toBe(false);
    expect(describeLlm({})).toBeUndefined();
  });

  it("one key and nothing else: the provider is inferred from the key, with its default model", () => {
    expect(resolveLlm({ OPENAI_API_KEY: "sk-x" })).toMatchObject({ status: "ready", provider: "openai", model: "gpt-4.1-mini", keyVar: "OPENAI_API_KEY" });
    expect(resolveLlm({ ANTHROPIC_API_KEY: "k" })).toMatchObject({ status: "ready", provider: "anthropic", model: "claude-haiku-4-5", keyVar: "ANTHROPIC_API_KEY" });
    expect(resolveLlm({ GROQ_API_KEY: "k" })).toMatchObject({ status: "ready", provider: "groq", model: "openai/gpt-oss-120b", keyVar: "GROQ_API_KEY" });
    expect(resolveLlm({ GOOGLE_GENERATIVE_AI_API_KEY: "k" })).toMatchObject({ status: "ready", provider: "google", model: "gemini-2.5-flash", keyVar: "GOOGLE_GENERATIVE_AI_API_KEY" });
  });

  it("the model object really is built for the inferred provider (the bug: only OPENAI_API_KEY used to try Google)", () => {
    const m = modelFromEnv({ OPENAI_API_KEY: "sk-x" }) as { modelId: string; provider: string };
    expect(m.modelId).toBe("gpt-4.1-mini");
    expect(m.provider).toMatch(/openai/);
  });

  it("LLM_PROVIDER and LLM_MODEL are optional overrides", () => {
    expect(resolveLlm({ LLM_PROVIDER: "groq", GROQ_API_KEY: "k", LLM_MODEL: "llama-3.1-8b-instant" })).toMatchObject({ provider: "groq", model: "llama-3.1-8b-instant" });
    expect(resolveLlm({ OPENAI_API_KEY: "k", LLM_MODEL: "gpt-4.1" })).toMatchObject({ provider: "openai", model: "gpt-4.1" });
  });

  it("several keys without LLM_PROVIDER: a fixed order (google, openai, anthropic, groq), and it says so", () => {
    const r = resolveLlm({ GROQ_API_KEY: "g", OPENAI_API_KEY: "o" });
    expect(r).toMatchObject({ status: "ready", provider: "openai" });
    expect(r.status === "ready" && r.note).toMatch(/several keys/i);
    expect(resolveLlm({ GROQ_API_KEY: "g", ANTHROPIC_API_KEY: "a" })).toMatchObject({ provider: "anthropic" });
  });

  it("LLM_PROVIDER picks among several keys", () => {
    expect(resolveLlm({ LLM_PROVIDER: "groq", GROQ_API_KEY: "g", OPENAI_API_KEY: "o" })).toMatchObject({ provider: "groq" });
  });

  it("LLM_PROVIDER whose key is missing is a clear misconfiguration, not a silent failure at the first question", () => {
    const r = resolveLlm({ LLM_PROVIDER: "groq", OPENAI_API_KEY: "o" });
    expect(r.status).toBe("misconfigured");
    expect(r.status === "misconfigured" && r.reason).toMatch(/GROQ_API_KEY/);
    expect(hasLlmKey({ LLM_PROVIDER: "groq", OPENAI_API_KEY: "o" })).toBe(false);
    expect(() => modelFromEnv({ LLM_PROVIDER: "groq", OPENAI_API_KEY: "o" })).toThrow(/GROQ_API_KEY/);
  });

  it("an unknown provider names the valid ones", () => {
    const r = resolveLlm({ LLM_PROVIDER: "mistral", OPENAI_API_KEY: "o" });
    expect(r.status === "misconfigured" && r.reason).toMatch(/google, openai, anthropic or groq/);
  });

  it("an empty or whitespace key is not a key (a blank line in .env.example copied as is)", () => {
    expect(resolveLlm({ GROQ_API_KEY: "", OPENAI_API_KEY: "   " })).toEqual({ status: "none" });
    expect(resolveLlm({ LLM_PROVIDER: "", LLM_MODEL: "", OPENAI_API_KEY: "k" })).toMatchObject({ provider: "openai", model: "gpt-4.1-mini" });
  });

  it("provider names are not case sensitive", () => {
    expect(resolveLlm({ LLM_PROVIDER: "Groq", GROQ_API_KEY: "k" })).toMatchObject({ provider: "groq" });
  });

  it("nothing that is shown or logged ever contains the key", () => {
    const key = "sk-secret-do-not-leak-123456";
    const env = { OPENAI_API_KEY: key };
    expect(JSON.stringify(resolveLlm(env))).not.toContain(key);
    expect(JSON.stringify(describeLlm(env))).not.toContain(key);
    expect(llmStartupLine(env)).not.toContain(key);
    expect(llmStartupLine({ LLM_PROVIDER: "groq", OPENAI_API_KEY: key })).not.toContain(key);
  });

  it("the start-up line says what will answer, from which variable, or what is wrong", () => {
    expect(llmStartupLine({})).toMatch(/offline agent/i);
    expect(llmStartupLine({ GROQ_API_KEY: "k" })).toMatch(/groq.*openai\/gpt-oss-120b.*GROQ_API_KEY/);
    expect(llmStartupLine({ LLM_PROVIDER: "groq", OPENAI_API_KEY: "o" })).toMatch(/GROQ_API_KEY/);
  });
});

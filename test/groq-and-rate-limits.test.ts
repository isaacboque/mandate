import { APICallError } from "ai";
import { describe, expect, it } from "vitest";
import { hasLlmKey, modelFor, modelFromEnv } from "../src/llm/model.js";
import { REAL_CASES, parseModelSpec, runMatrix, runRealModelEval, summarizeModel, withRateLimitRetry } from "../src/eval/realModel.js";
import { scriptedModel } from "../src/eval/scriptedModel.js";

const r01 = REAL_CASES.find((c) => c.id === "r01")!;
const err429 = (headers: Record<string, string> = {}) =>
  new APICallError({ message: "Rate limit reached for model", url: "https://api.groq.com/openai/v1/chat/completions", requestBodyValues: {}, statusCode: 429, responseHeaders: headers, isRetryable: true });
const honestSteps = [
  { tools: [{ name: "search_products", input: { query: "indoor futsal shoes" } }] },
  { tools: [{ name: "propose_cart", input: { lines: [{ productId: "shoe-court-1", quantity: 1, reason: "fits" }], requiredAttributes: { size: "43" } } }] },
  { text: "Proposed." },
];

/** An honest scripted model whose first `n` calls throw `error`. */
function failingFirst(n: number, error: Error) {
  const m = scriptedModel(honestSteps);
  const real = m.doGenerate.bind(m) as (o: unknown) => Promise<unknown>;
  let calls = 0;
  (m as unknown as { doGenerate: (o: unknown) => Promise<unknown> }).doGenerate = async (o) => { if (calls++ < n) throw error; return real(o); };
  return m;
}

describe("Groq provider and OpenAI-compatible endpoints", () => {
  it("a Groq key alone counts as a key", () => {
    expect(hasLlmKey({ GROQ_API_KEY: "gsk_fake" })).toBe(true);
    expect(hasLlmKey({})).toBe(false);
  });

  it("builds a Groq model from GROQ_API_KEY, with the model id it was given", () => {
    const m = modelFor("groq", "llama-3.3-70b-versatile", { GROQ_API_KEY: "gsk_fake" }) as { modelId: string; provider: string };
    expect(m.modelId).toBe("llama-3.3-70b-versatile");
    expect(m.provider).toMatch(/groq/);
  });

  it("LLM_PROVIDER=groq with no LLM_MODEL uses the documented default", () => {
    const m = modelFromEnv({ LLM_PROVIDER: "groq", GROQ_API_KEY: "gsk_fake" }) as { modelId: string };
    expect(m.modelId).toBe("openai/gpt-oss-120b");
  });

  it("parses groq:<id> even when the id contains a slash", () => {
    expect(parseModelSpec("groq:openai/gpt-oss-120b")).toEqual({ provider: "groq", id: "openai/gpt-oss-120b", name: "groq:openai/gpt-oss-120b" });
  });

  it("OPENAI_BASE_URL points the openai provider at another OpenAI-compatible endpoint", () => {
    const m = modelFor("openai", "some-model", { OPENAI_API_KEY: "k", OPENAI_BASE_URL: "https://example.test/v1" }) as unknown as { config: { url: (o: { path: string }) => string } };
    expect(m.config.url({ path: "/chat/completions" })).toBe("https://example.test/v1/chat/completions");
  });
});

describe("rate limits (HTTP 429) are retried and kept apart from model behaviour", () => {
  it("a model that answers 429 twice and then answers is retried and counted normally", async () => {
    const waits: number[] = [];
    const [r] = await runRealModelEval(failingFirst(2, err429()), [r01], 1, { sleep: async (ms) => { waits.push(ms); } });
    expect(waits).toHaveLength(2);
    expect(r.mode).toBe("llm");
    expect(r.pass).toBe(true);
    expect(r.rateLimited).toBe(false);
  });

  it("honours retry-after (seconds)", async () => {
    const waits: number[] = [];
    await runRealModelEval(failingFirst(1, err429({ "retry-after": "2" })), [r01], 1, { sleep: async (ms) => { waits.push(ms); } });
    expect(waits).toEqual([2000]);
  });

  it("without retry-after it backs off exponentially, capped at 60 s", () => {
    const waits: number[] = [];
    const m = withRateLimitRetry(failingFirst(5, err429()), { sleep: async (ms) => { waits.push(ms); }, maxRetries: 5 });
    return (m.doGenerate as (o: unknown) => Promise<unknown>)({ prompt: [] }).catch(() => undefined).then(() => {
      expect(waits.length).toBe(5);
      expect(waits[0]).toBeLessThan(waits[4]);
      expect(Math.max(...waits)).toBeLessThanOrEqual(60_000);
    });
  });

  it("a model that always answers 429 ends as error: rate_limit and is left out of the rates", async () => {
    const rs = await runRealModelEval(failingFirst(1000, err429()), [r01], 2, { sleep: async () => {} });
    expect(rs.every((r) => r.mode === "error" && r.error === "rate_limit" && r.rateLimited)).toBe(true);
    const s = summarizeModel(rs);
    expect(s.rateLimited).toBe(2);
    expect(s.runs).toBe(0);
    expect(s.compromised).toBe(0);
    expect(s.taskTotal).toBe(0);
  });

  it("other errors are not retried", async () => {
    const waits: number[] = [];
    const [r] = await runRealModelEval(failingFirst(1, new Error("boom")), [r01], 1, { sleep: async (ms) => { waits.push(ms); } });
    expect(waits).toHaveLength(0);
    expect(r.rateLimited).toBe(false);
  });

  it("the matrix passes the pacing options through and still refuses without --yes", async () => {
    const out = await runMatrix({ models: [{ name: "mock:a", model: scriptedModel([{ text: "x" }]) }], cases: [r01], k: 1, yes: false, delayMs: 10 });
    expect(out.status).toBe("needs_confirmation");
  });

  it("--delay-ms waits between runs", async () => {
    const waits: number[] = [];
    await runRealModelEval(scriptedModel([{ text: "x" }]), [r01], 3, { sleep: async (ms) => { waits.push(ms); }, delayMs: 250 });
    expect(waits.filter((w) => w === 250)).toHaveLength(2);
  });
});

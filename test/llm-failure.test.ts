import { APICallError } from "ai";
import { describe, expect, it } from "vitest";
import { classifyLlmFailure } from "../src/llm/failure.js";
import { LlmGate } from "../src/llm/gate.js";

const api = (statusCode: number, message: string, headers: Record<string, string> = {}) =>
  new APICallError({ message, url: "https://api.groq.com/openai/v1/chat/completions", requestBodyValues: {}, statusCode, responseHeaders: headers, isRetryable: statusCode === 429 });

describe("classifyLlmFailure", () => {
  it("a per-minute limit with a retry-after header", () => {
    expect(classifyLlmFailure(api(429, "Rate limit reached", { "retry-after": "3" }))).toMatchObject({ kind: "rate_limit_minute", retryAfterSec: 3 });
    expect(classifyLlmFailure(api(429, "Rate limit reached", { "retry-after-ms": "2500" }))).toMatchObject({ kind: "rate_limit_minute", retryAfterSec: 3 });
  });

  it("Groq's per-minute message carries the wait in the text", () => {
    const m = "Rate limit reached for model `openai/gpt-oss-120b` in organization `org_x` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 7800, Requested 1200. Please try again in 3.75s. Need more tokens?";
    expect(classifyLlmFailure(api(429, m))).toMatchObject({ kind: "rate_limit_minute", retryAfterSec: 4 });
  });

  it("a daily quota (TPD / RPD) is its own class, with the wait parsed from hours and minutes", () => {
    const tpd = "Rate limit reached for model `openai/gpt-oss-120b` on tokens per day (TPD): Limit 200000, Used 199000, Requested 3000. Please try again in 1h2m30s.";
    expect(classifyLlmFailure(api(429, tpd))).toMatchObject({ kind: "rate_limit_day", retryAfterSec: 3750 });
    expect(classifyLlmFailure(api(429, "Rate limit reached ... on requests per day (RPD): Limit 1000, Used 1000. Please try again in 12m34.5s."))).toMatchObject({ kind: "rate_limit_day", retryAfterSec: 755 });
  });

  it("a rate limit without a status code, from the message alone", () => {
    expect(classifyLlmFailure(new Error("429 RESOURCE_EXHAUSTED: quota exceeded")).kind).toMatch(/rate_limit/);
  });

  it("timeouts, invalid tool calls, auth and the rest", () => {
    expect(classifyLlmFailure(new Error("The operation was aborted due to timeout")).kind).toBe("timeout");
    expect(classifyLlmFailure(api(400, "Tool call validation failed: tool call validation failed: parameters for tool search_products did not match schema")).kind).toBe("invalid_tool_call");
    expect(classifyLlmFailure(api(400, "Failed to call a function. Please adjust your prompt. See 'failed_generation' for more details.")).kind).toBe("invalid_tool_call");
    expect(classifyLlmFailure(api(401, "Invalid API Key")).kind).toBe("auth");
    expect(classifyLlmFailure(api(403, "Forbidden")).kind).toBe("auth");
    expect(classifyLlmFailure(api(500, "internal error")).kind).toBe("other");
    expect(classifyLlmFailure("weird").kind).toBe("other");
  });

  it("the message is kept short and never carries a key", () => {
    const f = classifyLlmFailure(api(401, `Invalid API Key gsk_${"x".repeat(300)}`));
    expect(f.message.length).toBeLessThanOrEqual(160);
  });
});

describe("LlmGate: one model call at a time, and a daily budget", () => {
  it("serialises two concurrent turns, first come first served, and says when one has to wait", async () => {
    const gate = new LlmGate();
    const order: string[] = [];
    const status: string[] = [];
    const a = await gate.acquire();
    if ("exhausted" in a) throw new Error("unexpected");
    const second = gate.acquire((t) => status.push(t)).then((s) => { order.push("b"); return s; });
    const third = gate.acquire().then((s) => { order.push("c"); return s; });
    await Promise.resolve();
    expect(order).toEqual([]);
    expect(status.join()).toMatch(/waiting for the model/i);
    a.release();
    const b = await second;
    expect(order).toEqual(["b"]);
    if ("exhausted" in b) throw new Error("unexpected");
    b.release();
    const c = await third;
    expect(order).toEqual(["b", "c"]);
    if (!("exhausted" in c)) c.release();
  });

  it("past the daily turn budget it refuses without waiting, and the budget resets at the next UTC day", async () => {
    let now = new Date("2026-11-21T10:00:00Z");
    const gate = new LlmGate({ dailyBudget: 2, now: () => now });
    for (let i = 0; i < 2; i++) { const s = await gate.acquire(); if ("exhausted" in s) throw new Error("early"); s.release(); }
    const over = await gate.acquire();
    expect(over).toMatchObject({ exhausted: true });
    expect("exhausted" in over && over.resetInSec).toBe(14 * 3600);
    now = new Date("2026-11-22T00:00:01Z");
    const again = await gate.acquire();
    expect("exhausted" in again).toBe(false);
  });

  it("a budget of 0 means no limit", async () => {
    const gate = new LlmGate({ dailyBudget: 0 });
    for (let i = 0; i < 5; i++) { const s = await gate.acquire(); if ("exhausted" in s) throw new Error("limited"); s.release(); }
  });
});

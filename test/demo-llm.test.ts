import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { makeHarness } from "../src/eval/harness.js";
import { scriptedModel } from "../src/eval/scriptedModel.js";
import { LlmGate } from "../src/llm/gate.js";
import { ApprovalQueue } from "../src/approval/queue.js";
import { FixtureCatalog } from "../src/catalog/FixtureCatalog.js";
import { MockPayments } from "../src/payments/MockPayments.js";
import { createApp } from "../src/server/app.js";
import { MandateService } from "../src/service/service.js";
import { MemoryTracer } from "../src/trace/trace.js";

const SHOES = "Indoor futsal shoes, size 43, non-marking sole, max 90 €";
const api = (statusCode: number, message: string, headers: Record<string, string> = {}) =>
  new APICallError({ message, url: "https://api.groq.com/openai/v1/chat/completions", requestBodyValues: {}, statusCode, responseHeaders: headers, isRetryable: statusCode === 429 });

/** A model whose first calls throw `errors` (in order) and which then answers "Hello.". */
function flaky(errors: Error[]) {
  const m = scriptedModel([{ text: "Hello." }]);
  const real = (m.doGenerate as (o: unknown) => Promise<unknown>).bind(m);
  let i = 0;
  (m as unknown as { doGenerate: (o: unknown) => Promise<unknown> }).doGenerate = async (o) => { if (i < errors.length) throw errors[i++]; i++; return real(o); };
  return { model: m, calls: () => i };
}
const rulesStarted = (h: ReturnType<typeof makeHarness>) => h.tracer.events.some((e) => (e.step === "concierge.start" || e.step === "agent.start") && (e.args as { mode?: string })?.mode === "rules");
const MIN = (s = 3) => api(429, "Rate limit reached for model on tokens per minute (TPM). Please try again in 3s.", { "retry-after": String(s) });

describe("rate limits are told honestly", () => {
  it("a 429 with retry-after 3 s: one server-side retry, the answer arrives, the status line says why it waited", async () => {
    const f = flaky([MIN(3)]);
    const waits: number[] = [], status: string[] = [];
    const h = makeHarness({}, { model: f.model, sleep: async (ms) => { waits.push(ms); } });
    const r = await h.service.chat("hi", undefined, (t) => status.push(t));
    expect(waits).toEqual([3000]);
    expect(status.join(" ")).toMatch(/busy, retrying in 3 s/i);
    expect(r.messages[0].text).toBe("Hello.");
    expect(r.cards).toEqual([]);
    expect(f.calls()).toBe(2);
  });

  it("a 429 twice: an llm_limited card that says it is a usage limit, nothing was proposed, no rules-agent turn", async () => {
    const f = flaky([MIN(3), MIN(3)]);
    const h = makeHarness({}, { model: f.model, sleep: async () => {} });
    const r = await h.service.chat(SHOES);
    expect(r.cards).toHaveLength(1);
    expect(r.cards[0]).toMatchObject({ type: "llm_limited", variant: "minute", retryAfterSec: 3 });
    const text = r.messages[0].text;
    expect(text).toMatch(/free model quota/i);
    expect(text).toMatch(/usage limit, not a bug/i);
    expect(text).toMatch(/Nothing was proposed or spent/);
    expect(text).toMatch(/about 3 s/);
    expect(text).toMatch(/offline agent/i);
    expect(h.service.list()).toEqual([]);
    expect(rulesStarted(h)).toBe(false);
    expect(f.calls()).toBe(2);
    const ev = h.tracer.events.find((e) => e.step === "concierge.failed_closed")!;
    expect((ev as unknown as { class?: string }).class ?? (ev.args as { class?: string })?.class).toBe("rate_limit_minute");
  });

  it("a wait longer than 8 s is not retried on the server: the card says how long", async () => {
    const f = flaky([MIN(30)]);
    const waits: number[] = [];
    const h = makeHarness({}, { model: f.model, sleep: async (ms) => { waits.push(ms); } });
    const r = await h.service.chat("hi");
    expect(waits).toEqual([]);
    expect(f.calls()).toBe(1);
    expect(r.cards[0]).toMatchObject({ type: "llm_limited", variant: "minute", retryAfterSec: 30 });
    expect(r.messages[0].text).toMatch(/about 30 s/);
  });

  it("a daily quota: the day variant, with hours, never retried", async () => {
    const f = flaky([api(429, "Rate limit reached for model on tokens per day (TPD): Limit 200000. Please try again in 2h0m0s.")]);
    const h = makeHarness({}, { model: f.model, sleep: async () => { throw new Error("must not wait"); } });
    const r = await h.service.chat("hi");
    expect(r.cards[0]).toMatchObject({ type: "llm_limited", variant: "day", retryAfterSec: 7200 });
    expect(r.messages[0].text).toMatch(/Today's free model quota is used up; it resets in about 2 h/);
    expect(r.messages[0].text).toMatch(/usage limit of the .*, not a bug/i);
  });

  it("the server's own daily turn budget: past it the card comes without calling the model", async () => {
    const f = flaky([]);
    const h = makeHarness({}, { model: f.model, llmGate: new LlmGate({ dailyBudget: 1, now: () => new Date("2026-11-21T22:00:00Z") }) });
    await h.service.chat("hi");
    expect(f.calls()).toBe(1);
    const r = await h.service.chat("again");
    expect(f.calls()).toBe(1);
    expect(r.cards[0]).toMatchObject({ type: "llm_limited", variant: "day", retryAfterSec: 7200 });
    expect(r.messages[0].text).toMatch(/resets in about 2 h/);
    expect(h.service.list()).toEqual([]);
  });

  it("ask() fails closed with the same classes: nothing proposed, not the rules agent", async () => {
    const f = flaky([MIN(3), MIN(3)]);
    const h = makeHarness({}, { model: f.model, sleep: async () => {} });
    const { proposals, run } = await h.service.ask(SHOES);
    expect(proposals).toEqual([]);
    expect(run.failedClosed).toBe(true);
    expect(run.failure).toBe("rate_limit_minute");
    expect(run.summary).toMatch(/usage limit, not a bug/i);
    expect(rulesStarted(h)).toBe(false);
  });
});

describe("the other failures keep failing closed, each with its own honest line", () => {
  const cases: [string, Error, RegExp][] = [
    ["timeout", new Error("The operation was aborted due to timeout"), /The model took too long; nothing was done\./],
    ["invalid tool call", api(400, "Tool call validation failed: tool call validation failed: parameters for tool search_products did not match schema"), /The model made an invalid tool call; the system refused it and did nothing\. This is the safety behaviour\./],
    ["auth", api(401, "Invalid API Key"), /The demo's model key is not working; tell the owner\./],
    ["other", api(500, "internal error"), /The model failed, nothing was proposed\. Try again\./],
  ];
  for (const [name, err, line] of cases) {
    it(name, async () => {
      const h = makeHarness({}, { model: flaky([err, err]).model });
      const r = await h.service.chat(SHOES);
      expect(r.cards.map((c) => c.type)).toEqual(["error"]);
      expect(r.messages[0].text).toMatch(line);
      expect(h.service.list()).toEqual([]);
      expect(rulesStarted(h)).toBe(false);
    });
  }

  it("an auth failure is logged for the owner, without the key", async () => {
    const h = makeHarness({}, { model: flaky([api(401, "Invalid API Key gsk_abcdefghijklmnopqrstuvwxyz0123")]).model });
    await h.service.chat("hi");
    const ev = h.tracer.events.find((e) => e.step === "llm.auth_failed");
    expect(ev).toBeDefined();
    expect(JSON.stringify(ev)).not.toContain("gsk_abcdefgh");
  });
});

describe("the offline agent is an explicit choice, per session", () => {
  it("after the person chooses it, that session uses the rules agent and says so; another session still uses the model", async () => {
    const f = flaky([]);
    const a = makeHarness({}, { model: f.model });
    const b = makeHarness({}, { model: flaky([]).model });
    expect(a.service.agentMode).toBe("llm");
    a.service.setOffline(true);
    expect(a.service.agentMode).toBe("rules");
    expect(a.service.offline).toBe(true);
    const r = await a.service.chat(SHOES);
    expect(r.cards.map((c) => c.type)).toContain("proposal");
    expect(f.calls()).toBe(0);
    expect(b.service.agentMode).toBe("llm");
    expect(b.service.offline).toBe(false);
    a.service.setOffline(false);
    expect(a.service.agentMode).toBe("llm");
  });

  it("with no model configured there is nothing to switch: offline is a no-op", () => {
    const h = makeHarness();
    h.service.setOffline(true);
    expect(h.service.agentMode).toBe("rules");
  });
});

describe("one model call at a time", () => {
  it("two concurrent turns never overlap on the model, and the second sees a waiting status", async () => {
    let running = 0, peak = 0;
    const m = new MockLanguageModelV4({
      doGenerate: async () => {
        running++; peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 25));
        running--;
        return { content: [{ type: "text", text: "ok" }], finishReason: { unified: "stop", raw: "x" }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }, warnings: [] } as never;
      },
    });
    const gate = new LlmGate();
    const a = makeHarness({}, { model: m as never, llmGate: gate });
    const b = makeHarness({}, { model: m as never, llmGate: gate });
    const status: string[] = [];
    await Promise.all([a.service.chat("one"), b.service.chat("two", undefined, (t) => status.push(t))]);
    expect(peak).toBe(1);
    expect(status.join(" ")).toMatch(/waiting for the model/i);
  });
});

describe("HTTP: health, offline switch, and status events", () => {
  function server(model?: never, opts: { sleep?: (ms: number) => Promise<void> } = {}) {
    const now = () => new Date("2026-11-12T10:00:00Z");
    const tracer = new MemoryTracer(now);
    const approvals = new ApprovalQueue(tracer, "run", now);
    const payments = new MockPayments(approvals, tracer, { now, traceId: "run" });
    const service = new MandateService({ catalog: new FixtureCatalog({ now }), attackCatalog: new FixtureCatalog({ now }), payments, approvals, tracer, runId: "run", now, model, sleep: opts.sleep });
    const app = createApp(service, { demoMode: "mock", currency: "EUR", ...(model ? { llm: { provider: "groq", model: "openai/gpt-oss-120b" } } : {}) });
    return { service, app };
  }

  it("/api/health says what answers and with which model, and never a key", async () => {
    const withModel = await (await server(flaky([]).model as never).app.request("/api/health")).json();
    expect(withModel).toEqual({ ok: true, agent: "llm", model: "openai/gpt-oss-120b", provider: "groq" });
    const keyless = await (await server().app.request("/api/health")).json();
    expect(keyless).toEqual({ ok: true, agent: "rules", model: null, provider: null });
  });

  it("POST /api/agent/offline is the person's switch: /api/config then says offline", async () => {
    const s = server(flaky([]).model as never);
    const before = await (await s.app.request("/api/config")).json();
    expect(before).toMatchObject({ agent: "llm", offline: false, llm: { model: "openai/gpt-oss-120b" } });
    const res = await s.app.request("/api/agent/offline", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ offline: true }) });
    expect(res.status).toBe(200);
    const after = await (await s.app.request("/api/config")).json();
    expect(after).toMatchObject({ agent: "rules", offline: true });
    const bad = await s.app.request("/api/agent/offline", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ offline: "yes" }) });
    expect(bad.status).toBe(400);
  });

  it("the stream carries a status event while the server waits to retry, then the done", async () => {
    const f = flaky([MIN(3)]);
    const s = server(f.model as never, { sleep: async () => {} });
    const res = await s.app.request("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "hi" }) });
    expect((await res.json()).messages[0].text).toBe("Hello.");
    const f2 = flaky([MIN(3)]);
    const m = f2.model as unknown as MockLanguageModelV4;
    // the streaming path uses doStream: make it fail once with a 429, then stream
    const stream = new MockLanguageModelV4({
      doStream: (() => { let n = 0; return async () => { if (n++ === 0) throw MIN(3); return { stream: new ReadableStream({ start(c) { c.enqueue({ type: "stream-start", warnings: [] }); c.enqueue({ type: "text-start", id: "1" }); c.enqueue({ type: "text-delta", id: "1", delta: "Hi!" }); c.enqueue({ type: "text-end", id: "1" }); c.enqueue({ type: "finish", finishReason: { unified: "stop", raw: "x" }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } } }); c.close(); } }) } as never; }; })(),
    });
    void m;
    const t = server(stream as never, { sleep: async () => {} });
    const raw = await (await t.app.request("/api/chat/stream", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "hi" }) })).text();
    const events = raw.split("\n\n").filter(Boolean).map((b) => /^event: (.*)$/m.exec(b)?.[1]);
    expect(events).toContain("status");
    expect(events.at(-1)).toBe("done");
    expect(events.indexOf("status")).toBeLessThan(events.indexOf("done"));
  });
});

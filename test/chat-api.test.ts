import { describe, expect, it } from "vitest";
import { ApprovalQueue } from "../src/approval/queue.js";
import { FixtureCatalog } from "../src/catalog/FixtureCatalog.js";
import { MockPayments } from "../src/payments/MockPayments.js";
import { createApp } from "../src/server/app.js";
import { RateLimiter } from "../src/server/limits.js";
import { MandateService } from "../src/service/service.js";
import { MemoryTracer } from "../src/trace/trace.js";

function api() {
  const now = () => new Date("2026-11-12T10:00:00Z");
  const tracer = new MemoryTracer(now);
  const approvals = new ApprovalQueue(tracer, "run", now);
  const payments = new MockPayments(approvals, tracer, { now, traceId: "run" });
  const service = new MandateService({ catalog: new FixtureCatalog({ now }), attackCatalog: new FixtureCatalog({ now }), payments, approvals, tracer, runId: "run", now });
  const app = createApp(service, { demoMode: "mock", currency: "EUR" });
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, json: (await res.json()) as any };
  };
  return { call, payments, service };
}

describe("chat over HTTP: a person and the agent, turn by turn", () => {
  it("question without a budget -> draft -> sign -> buy -> amend -> revoke -> pay refused", async () => {
    const { call, payments } = api();

    const q = await call("POST", "/api/chat", { text: "I want futsal shoes" });
    expect(q.json.messages[0].text).toMatch(/how much/i);
    expect(q.json.cards).toEqual([]);

    const d = await call("POST", "/api/chat", { text: "A contract for futsal shoes, up to 100 € in total" });
    expect(d.json.cards.map((c: any) => c.type)).toEqual(["draft"]);
    expect((await call("GET", "/api/mandates")).json).toEqual([]);

    const signed = await call("POST", `/api/drafts/${d.json.cards[0].draft.id}/sign`, d.json.cards[0].draft.mandate); // the person's button
    expect(signed.status).toBe(201);
    const [m] = (await call("GET", "/api/mandates")).json;
    expect(m).toMatchObject({ hash: signed.json.hash, status: "active", remainingCents: 10000 });

    const buy = await call("POST", "/api/chat", { text: "Buy indoor futsal shoes, size 43, max 90 €" });
    const proposal = buy.json.cards[0].proposal;
    expect(proposal).toMatchObject({ mandateHash: m.hash, status: "pending" });

    const amend = await call("POST", "/api/chat", { text: "Raise the budget to 250 €" });
    const amendment = amend.json.cards[0].amendment;
    expect(amendment).toMatchObject({ status: "pending", baseHash: m.hash });
    expect((await call("GET", "/api/mandates")).json).toHaveLength(1); // pending until signed

    expect((await call("POST", `/api/proposals/${proposal.id}/approve`)).json.status).toBe("awaiting_buyer");
    expect((await call("POST", `/api/mandates/${m.hash}/revoke`)).json.status).toBe("revoked");
    const pay = await call("POST", `/api/proposals/${proposal.id}/pay`);
    expect(pay.status).toBe(400);
    expect(pay.json.error).toMatch(/revoked/);
    expect((await payments.list()).filter((o) => o.status === "completed")).toEqual([]);
  });

  it("signing an amendment makes a successor and retires the old contract", async () => {
    const { call } = api();
    const d = await call("POST", "/api/chat", { text: "A contract for futsal shoes, up to 100 € in total" });
    const first = (await call("POST", `/api/drafts/${d.json.cards[0].draft.id}/sign`, d.json.cards[0].draft.mandate)).json;
    const a = (await call("POST", "/api/chat", { text: "Raise the budget to 250 €" })).json.cards[0].amendment;
    const next = await call("POST", `/api/amendments/${a.id}/sign`);
    expect(next.status).toBe(201);
    expect(next.json.mandate.supersedes).toBe(first.hash);
    expect((await call("GET", "/api/mandates")).json.map((m: any) => m.status)).toEqual(["superseded", "active"]);
    const rej = (await call("POST", "/api/chat", { text: "Raise the budget to 300 €" })).json.cards[0].amendment;
    expect((await call("POST", `/api/amendments/${rej.id}/reject`)).json.status).toBe("rejected");
  });

  it("validates what the person signs, bounds request sizes and rate-limits the model routes", async () => {
    const { call } = api();
    const d = (await call("POST", "/api/chat", { text: "A contract for futsal shoes, up to 100 € in total" })).json.cards[0].draft;
    expect((await call("POST", `/api/drafts/${d.id}/sign`, { ...d.mandate, totalBudgetCents: -1 })).status).toBe(400);
    expect((await call("POST", "/api/chat", { text: "x".repeat(501) })).status).toBe(400);
    expect((await call("POST", "/api/chat", {})).status).toBe(400);
    expect((await call("POST", "/api/mandates/000000000000/revoke")).status).toBe(400);
    const now = () => new Date("2026-11-12T10:00:00Z");
    const tracer = new MemoryTracer(now);
    const approvals = new ApprovalQueue(tracer, "r", now);
    const svc = new MandateService({ catalog: new FixtureCatalog({ now }), attackCatalog: new FixtureCatalog({ now }), payments: new MockPayments(approvals, tracer, { now, traceId: "r" }), approvals, tracer, runId: "r", now });
    const limited = createApp(svc, { demoMode: "mock", currency: "EUR" }, new RateLimiter(1, 100));
    const post = () => limited.request("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "hello there" }) });
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(429);
  });

  it("GET /api/chat returns the bounded history so a reload keeps the conversation", async () => {
    const { call } = api();
    await call("POST", "/api/chat", { text: "hello there" });
    const h = (await call("GET", "/api/chat")).json;
    expect(h.map((m: any) => m.role)).toEqual(["user", "assistant"]);
  });
});

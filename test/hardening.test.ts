import { describe, expect, it } from "vitest";
import { ApprovalQueue } from "../src/approval/queue.js";
import { Channel3Catalog } from "../src/catalog/Channel3Catalog.js";
import { FixtureCatalog } from "../src/catalog/FixtureCatalog.js";
import type { Mandate } from "../src/mandate/types.js";
import { MockPayments } from "../src/payments/MockPayments.js";
import { createApp } from "../src/server/app.js";
import { MandateService } from "../src/service/service.js";
import { MemoryTracer } from "../src/trace/trace.js";

const NOW = new Date("2026-11-12T10:00:00Z");
const ASK = "Indoor futsal shoes, size 43, non-marking sole, max 90 €";
const baseMandate: Mandate = {
  currency: "EUR", totalBudgetCents: 9000, perItemCapCents: 9000, allowedCategories: ["shoes"], maxQuantityPerItem: 1,
  expiresAt: "2026-11-12T18:00:00Z", autonomy: { mode: "ask_always" },
};

function setup(opts: { llmTimeoutMs?: number; model?: never } = {}) {
  const now = () => NOW;
  const tracer = new MemoryTracer(now);
  const approvals = new ApprovalQueue(tracer, "run", now);
  const payments = new MockPayments(approvals, tracer, { now, traceId: "run" });
  const service = new MandateService({
    catalog: new FixtureCatalog({ now }), attackCatalog: new FixtureCatalog({ now }), payments, approvals, tracer, runId: "run", now, idPrefix: "abc", ...opts,
  });
  service.setMandate(baseMandate);
  return { service, tracer };
}

describe("catalog: a price that makes no sense is not a product", () => {
  const offer = (price: number, domain: string) => ({ url: `https://${domain}/x`, domain, price: { price, currency: "eur" }, availability: "InStock" });
  const fetching = (products: unknown[]) => (async () => new Response(JSON.stringify({ products }), { status: 200 })) as unknown as typeof fetch;
  const search = (products: unknown[]) => new Channel3Catalog("k", { fetch: fetching(products), now: () => NOW, cacheMs: 0 }).search("x");

  it("drops offers priced at zero, below zero or beyond what JSON can say, and keeps the cheapest valid one", async () => {
    const [p] = await search([{ id: "a", title: "Shoe", offers: [offer(0, "free.example"), offer(-5, "neg.example"), offer(Number.POSITIVE_INFINITY, "inf.example"), offer(79.9, "ok.example")] }]);
    expect(p).toMatchObject({ id: "a", merchant: "ok.example", priceCents: 7990 });
  });
  it("a product whose only offers are invalid is not returned at all", async () => {
    expect(await search([{ id: "b", title: "Shoe", offers: [offer(0, "free.example"), offer(-1, "neg.example")] }])).toEqual([]);
  });
});

describe("HTTP API hardening", () => {
  const json = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("rejects absurd amounts: money stays far inside the range where integer cents are exact", async () => {
    const { service } = setup();
    const app = createApp(service, { demoMode: "mock", currency: "EUR" });
    for (const bad of [{ totalBudgetCents: 9e15 }, { perItemCapCents: 1e12 }, { autonomy: { mode: "auto_under", thresholdCents: 1e12 } }]) {
      const res = await app.request("/api/mandate", json({ ...baseMandate, ...bad }));
      expect(res.status).toBe(400);
    }
    expect((await app.request("/api/mandate", json(baseMandate))).status).toBe(201);
  });

  it("sends browser hardening headers on every answer", async () => {
    const { service } = setup();
    const res = await createApp(service, { demoMode: "mock", currency: "EUR" }).request("/api/health");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("permissions-policy")).toContain("camera=()");
  });

  it("refuses a request body over the size limit before parsing it", async () => {
    const { service } = setup();
    const app = createApp(service, { demoMode: "mock", currency: "EUR" });
    const res = await app.request("/api/ask", json({ text: "x".repeat(200_000) }));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toMatch(/too large/i);
  });

  it("an unknown /api route is a JSON 404, not the web page", async () => {
    const { service } = setup();
    const res = await createApp(service, { demoMode: "mock", currency: "EUR" }).request("/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("an audit for an unknown proposal is a plain error, not a file download", async () => {
    const { service } = setup();
    const res = await createApp(service, { demoMode: "mock", currency: "EUR" }).request("/api/proposals/nope/audit");
    expect(res.status).toBe(400);
    expect(res.headers.get("content-disposition")).toBeNull();
  });
});

describe("audit export", () => {
  it("proposal 1 does not pull in the trace of proposal 10 (ids are matched whole, not as a prefix)", async () => {
    const { service } = setup();
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) ids.push((await service.attack()).id);
    expect(ids[0]).toBe("prop_abc_1");
    expect(ids[9]).toBe("prop_abc_10");
    const own = service.audit(ids[0]).trace.filter((e) => e.step === "guardrails.checkCart");
    expect(own).toHaveLength(1);
    expect((own[0].args as { proposalId: string }).proposalId).toBe("prop_abc_1");
  });
});

describe("double submit", () => {
  it("two Pay clicks at once capture once and both get the paid purchase", async () => {
    const { service, tracer } = setup();
    const { proposals } = await service.ask(ASK);
    await service.approve(proposals[0].id);
    const [a, b] = await Promise.all([service.pay(proposals[0].id), service.pay(proposals[0].id)]);
    expect(a.status).toBe("paid");
    expect(b.status).toBe("paid");
    expect(b.error).toBeUndefined();
    expect(tracer.events.filter((e) => e.step === "payment.captured")).toHaveLength(1);
    expect(tracer.events.filter((e) => e.step === "execution.recheck")).toHaveLength(2); // one at approval, one at payment
  });

  it("two Approve clicks at once approve once and neither shows an error", async () => {
    const { service, tracer } = setup();
    const { proposals } = await service.ask(ASK);
    const [a, b] = await Promise.all([service.approve(proposals[0].id), service.approve(proposals[0].id)]);
    expect(a.status).toBe("awaiting_buyer");
    expect(b.status).toBe("awaiting_buyer");
    expect(tracer.events.filter((e) => e.step === "approval.approved")).toHaveLength(1);
    expect(tracer.events.filter((e) => e.step === "order.created")).toHaveLength(1);
  });

  it("two different carts approved at once cannot commit more than the budget: the first wins, the second is refused", async () => {
    const { service, tracer } = setup();
    const a = (await service.ask(ASK)).proposals[0];
    const b = (await service.ask(ASK)).proposals[0];
    const [ra, rb] = await Promise.all([service.approve(a.id), service.approve(b.id)]);
    expect(ra.status).toBe("awaiting_buyer");
    expect(rb.status).toBe("failed");
    expect(rb.error).toMatch(/total_budget/);
    expect(service.spentCents()).toBeLessThanOrEqual(baseMandate.totalBudgetCents);
    expect(tracer.events.filter((e) => e.step === "order.created")).toHaveLength(1);
  });

  it("a second Approve after the first finished still says so", async () => {
    const { service } = setup();
    const { proposals } = await service.ask(ASK);
    await service.approve(proposals[0].id);
    await expect(service.approve(proposals[0].id)).rejects.toThrow(/nothing to approve/);
  });
});

describe("a model that never answers", () => {
  it("is cut off after the timeout and the turn fails closed: nothing is proposed", async () => {
    const { MockLanguageModelV4 } = await import("ai/test");
    const hang = new MockLanguageModelV4({
      doGenerate: (options: { abortSignal?: AbortSignal }) =>
        new Promise((_, reject) => options.abortSignal?.addEventListener("abort", () => reject(new Error("The operation was aborted due to timeout")))),
    });
    const { service, tracer } = setup({ llmTimeoutMs: 50, model: hang as never });
    const { proposals, run } = await service.ask(ASK);
    expect(run.failedClosed).toBe(true);
    expect(run.summary).toMatch(/took too long; nothing was done/i);
    expect(proposals).toHaveLength(0);
    const failed = tracer.events.find((e) => e.step === "agent.failed_closed");
    expect(String(failed?.error)).toMatch(/timeout/);
  });
});

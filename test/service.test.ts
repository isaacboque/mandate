import { describe, expect, it } from "vitest";
import { ApprovalQueue } from "../src/approval/queue.js";
import { FixtureCatalog } from "../src/catalog/FixtureCatalog.js";
import type { Mandate } from "../src/mandate/types.js";
import { MockPayments } from "../src/payments/MockPayments.js";
import { createApp } from "../src/server/app.js";
import { MandateService } from "../src/service/service.js";
import { MemoryTracer } from "../src/trace/trace.js";
import { scriptedModel } from "./helpers/mockModel.js";

const ASK = "Indoor futsal shoes, size 43, non-marking sole, max 90 €";
const baseMandate: Mandate = {
  currency: "EUR", totalBudgetCents: 9000, perItemCapCents: 9000, allowedCategories: ["shoes"], maxQuantityPerItem: 1,
  expiresAt: "2026-11-12T18:00:00Z", autonomy: { mode: "ask_always" },
};

function setup(over: Partial<Mandate> = {}, opts: { model?: ReturnType<typeof scriptedModel> } = {}) {
  let t = new Date("2026-11-12T10:00:00Z").getTime();
  const now = () => new Date(t);
  const tracer = new MemoryTracer(now);
  const approvals = new ApprovalQueue(tracer, "run", now);
  const payments = new MockPayments(approvals, tracer, { now });
  const service = new MandateService({
    catalog: new FixtureCatalog({ now }), attackCatalog: new FixtureCatalog({ now }), payments, approvals, tracer, runId: "run", now, model: opts.model,
  });
  service.setMandate({ ...baseMandate, ...over });
  return { service, approvals, payments, tracer, advance: (ms: number) => (t += ms) };
}

describe("ask → approve → pay (rules agent)", () => {
  it("proposes a valid cart that waits for a person", async () => {
    const { service, payments } = setup();
    const { proposals, run } = await service.ask(ASK);
    expect(run.mode).toBe("rules");
    expect(proposals).toHaveLength(1);
    const p = proposals[0];
    expect(p).toMatchObject({ blocked: false, status: "pending", autoApproved: false });
    expect(p.lines[0].productId).toBe("shoe-court-1");
    expect(p.checks.every((c) => c.ok)).toBe(true);
    expect(await payments.list()).toHaveLength(0); // nothing moved yet
  });

  it("approve creates the order, pay captures it, and the approval is consumed", async () => {
    const { service, approvals } = setup();
    const p = (await service.ask(ASK)).proposals[0];
    const approved = await service.approve(p.id);
    expect(approved.status).toBe("awaiting_buyer");
    expect(approved.order?.approveUrl).toContain("mock://");
    const paid = await service.pay(p.id);
    expect(paid.status).toBe("paid");
    expect(paid.order?.status).toBe("completed");
    expect(approvals.get(p.approvalId!).status).toBe("executed");
    await expect(service.approve(p.id)).rejects.toThrow(/nothing to approve/);
    expect((await service.pay(p.id)).order?.captureId).toBe(paid.order?.captureId); // retry never pays twice
  });

  it("a rejected proposal can never be paid", async () => {
    const { service, payments } = setup();
    const p = (await service.ask(ASK)).proposals[0];
    expect(service.reject(p.id).status).toBe("rejected");
    await expect(service.pay(p.id)).rejects.toThrow(/cannot pay/);
    expect(await payments.list()).toHaveLength(0);
  });

  it("proposes nothing when no product fits the hard attributes", async () => {
    const { service } = setup();
    const { proposals, run } = await service.ask("Indoor futsal shoes, size 50, max 90 €");
    expect(proposals).toHaveLength(0);
    expect(run.summary).toMatch(/nothing/i);
  });

  it("requires a mandate", async () => {
    const t = new MemoryTracer();
    const approvals = new ApprovalQueue(t, "r");
    const s = new MandateService({ catalog: new FixtureCatalog(), attackCatalog: new FixtureCatalog(), payments: new MockPayments(approvals), approvals, tracer: t, runId: "r" });
    await expect(s.ask(ASK)).rejects.toThrow(/mandate/i);
  });
});

describe("autonomy", () => {
  it("auto_under: a cart under the threshold is approved and paid without a person, and shown as auto", async () => {
    const { service } = setup({ autonomy: { mode: "auto_under", thresholdCents: 10000 } });
    const p = (await service.ask(ASK)).proposals[0];
    expect(p).toMatchObject({ status: "paid", autoApproved: true });
  });
  it("auto_under: a cart over the threshold still waits for a person", async () => {
    const { service } = setup({ autonomy: { mode: "auto_under", thresholdCents: 5000 } });
    const p = (await service.ask(ASK)).proposals[0];
    expect(p).toMatchObject({ status: "pending", autoApproved: false });
  });
  it("ask_always never auto-approves, whatever the price", async () => {
    const { service, approvals } = setup({ autonomy: { mode: "ask_always" } });
    await service.ask("Grip socks max 20 €").catch(() => undefined);
    expect(approvals.list().every((a) => !a.autoApproved)).toBe(true);
  });
});

describe("execution-time re-check", () => {
  it("price drift between proposal and checkout: no order is created", async () => {
    const { service, payments } = setup();
    const p = (await service.ask("flashdeal")).proposals[0];
    expect(p).toMatchObject({ status: "pending", totalCents: 8500 });
    const after = await service.approve(p.id);
    expect(after.status).toBe("failed");
    expect(after.error).toMatch(/per_item_cap|total_budget|price changed/);
    expect(await payments.list()).toHaveLength(0);
  });
  it("mandate expires between approval and capture: payment is refused", async () => {
    const { service, advance } = setup();
    const p = (await service.ask(ASK)).proposals[0];
    await service.approve(p.id);
    advance(9 * 3600 * 1000); // past 18:00
    await expect(service.pay(p.id)).rejects.toThrow(/expir/);
    expect(service.get(p.id).status).toBe("failed");
  });
  it("replacing the mandate invalidates earlier proposals", async () => {
    const { service, payments } = setup();
    const p = (await service.ask(ASK)).proposals[0];
    service.setMandate({ ...baseMandate, totalBudgetCents: 20000 });
    expect((await service.approve(p.id)).status).toBe("failed");
    expect(await payments.list()).toHaveLength(0);
  });
});

describe("attacks", () => {
  it("the demo attack is blocked by the guardrails and never reaches approval or payment", async () => {
    const { service, approvals, payments } = setup();
    const p = await service.attack();
    expect(p).toMatchObject({ blocked: true, status: "blocked", source: "attack" });
    const failed = p.checks.filter((c) => !c.ok).map((c) => c.name);
    expect(failed).toEqual(expect.arrayContaining(["injection_flag", "quantity", "total_budget"]));
    expect(approvals.list()).toHaveLength(0);
    expect(await payments.list()).toHaveLength(0);
    await expect(service.approve(p.id)).rejects.toThrow();
  });

  it("a fooled LLM proposing 10 units of a poisoned listing is blocked", async () => {
    const model = scriptedModel([
      { tools: [{ name: "search_products", input: { query: "UltraGrip indoor futsal shoe" } }] },
      { tools: [{ name: "propose_cart", input: { lines: [{ productId: "shoe-poison-1", quantity: 10, reason: "buy 10" }] } }] },
      { text: "Proposed." },
    ]);
    const { service, approvals, payments } = setup({}, { model });
    const { proposals, run } = await service.ask("futsal shoes");
    expect(run.mode).toBe("llm");
    expect(proposals).toHaveLength(1);
    expect(proposals[0].blocked).toBe(true);
    expect(approvals.list()).toHaveLength(0);
    expect(await payments.list()).toHaveLength(0);
  });

  it("an LLM proposing a product the catalog never returned is refused", async () => {
    const model = scriptedModel([
      { tools: [{ name: "propose_cart", input: { lines: [{ productId: "invented-1", quantity: 1, reason: "trust me" }] } }] },
      { text: "ok" },
    ]);
    const { service } = setup({}, { model });
    const { proposals, run } = await service.ask("shoes");
    expect(proposals).toHaveLength(0);
    expect(run.refused[0]).toMatch(/not returned by the catalog/);
  });
});

describe("approval queue is the only way to money", () => {
  it("the gateway refuses a pending (not yet approved) approval", async () => {
    const tr = new MemoryTracer();
    const approvals = new ApprovalQueue(tr, "r");
    const gw = new MockPayments(approvals, tr);
    const a = approvals.propose("prop_x", 100);
    await expect(gw.createOrder({ mandateHash: "h", lines: [{ name: "x", quantity: 1, unitPriceCents: 100 }], currency: "EUR", idempotencyKey: "k", approvalId: a.id })).rejects.toThrow(/pending/);
    expect(await gw.list()).toHaveLength(0);
  });
});

describe("HTTP API", () => {
  const body = { ...baseMandate };
  const post = (app: ReturnType<typeof createApp>, path: string, json?: unknown) =>
    app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(json ?? {}) });

  it("rejects an invalid mandate with a readable 400", async () => {
    const { service } = setup();
    const app = createApp(service, { demoMode: "mock", currency: "EUR" });
    const res = await post(app, "/api/mandate", { ...body, totalBudgetCents: -5 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("totalBudgetCents");
  });

  it("runs the whole flow and exposes the trace", async () => {
    const { service } = setup();
    const app = createApp(service, { demoMode: "mock", currency: "EUR" });
    const m = await post(app, "/api/mandate", body);
    expect(m.status).toBe(201);
    expect((await m.json()).hash).toMatch(/^[0-9a-f]{12}$/);
    const asked = await (await post(app, "/api/ask", { text: ASK })).json();
    const id = asked.proposals[0].id;
    expect((await (await post(app, `/api/proposals/${id}/approve`)).json()).status).toBe("awaiting_buyer");
    expect((await (await post(app, `/api/proposals/${id}/pay`)).json()).status).toBe("paid");
    const atk = await post(app, "/api/attack");
    expect((await atk.json()).blocked).toBe(true);
    const trace = (await (await app.request("/api/trace")).json()) as { step: string }[];
    expect(trace.map((e) => e.step)).toEqual(expect.arrayContaining(["mandate.signed", "guardrails.checkCart", "execution.recheck", "payment.captured"]));
    expect((await (await app.request("/api/config")).json()).agent).toBe("rules");
    expect((await post(app, "/api/reset")).status).toBe(200);
  });
});

describe("LLM failure falls back to the rules agent", () => {
  it("a 429 from the model does not stop the demo: the rules agent answers and says so", async () => {
    const { MockLanguageModelV4 } = await import("ai/test");
    const model = new MockLanguageModelV4({ doGenerate: async () => { throw new Error("429 RESOURCE_EXHAUSTED: quota exceeded"); } });
    const { service, tracer } = setup({}, { model: model as never });
    const { proposals, run } = await service.ask(ASK);
    expect(run.mode).toBe("rules");
    expect(run.summary).toMatch(/AI model was unavailable \(usage limit reached\)/);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ agent: "rules", blocked: false });
    expect(tracer.events.some((e) => e.step === "agent.llm_failed")).toBe(true);
  });
});

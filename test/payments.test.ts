import { describe, expect, it } from "vitest";
import { MockPayments } from "../src/payments/MockPayments.js";
import { PayPalOrders, type ToolInvoker } from "../src/payments/PayPalOrders.js";
import { RestOrdersInvoker } from "../src/payments/RestOrdersInvoker.js";
import { orderIdempotencyKey, type ApprovalGuard, type CreateOrderInput } from "../src/payments/types.js";
import { MemoryTracer } from "../src/trace/trace.js";

/** Approval guard double: only ids in `granted` are executable, and each can be consumed once. */
function guard(granted: string[]): ApprovalGuard & { used: string[] } {
  const used: string[] = [];
  return {
    used,
    assertExecutable(id, op) {
      if (!granted.includes(id) || used.includes(id)) throw new Error(`approval ${id} is not executable for ${op}`);
    },
    markExecuted(id) {
      used.push(id);
    },
  };
}
const lines = [{ name: "Futsal shoe", quantity: 1, unitPriceCents: 7900 }];
const input = (over: Partial<CreateOrderInput> = {}): CreateOrderInput => ({
  mandateHash: "abc123abc123", lines, currency: "EUR", idempotencyKey: orderIdempotencyKey("abc123abc123", lines, "EUR"), approvalId: "A1", ...over,
});
const NOW = () => new Date("2026-11-12T10:00:00Z");

describe("MockPayments", () => {
  it("refuses to create or capture without an executable approval, and traces the refusal", async () => {
    const tr = new MemoryTracer();
    const gw = new MockPayments(guard([]), tr);
    await expect(gw.createOrder(input())).rejects.toThrow(/not executable/);
    expect(tr.events.some((e) => e.step === "payments.create_order.refused")).toBe(true);
    expect(await gw.list()).toHaveLength(0);
  });
  it("create → buyer approval → capture; capture consumes the approval", async () => {
    const g = guard(["A1"]);
    const gw = new MockPayments(g, undefined, { now: NOW });
    const o = await gw.createOrder(input());
    expect(o).toMatchObject({ status: "awaiting_buyer", amountCents: 7900, currency: "EUR", createdAt: "2026-11-12T10:00:00.000Z" });
    expect(o.approveUrl).toContain(o.id);
    await expect(gw.captureOrder(o.id, "A1")).rejects.toThrow(/buyer has not approved/);
    gw.simulateBuyerApproval(o.id);
    const done = await gw.captureOrder(o.id, "A1");
    expect(done.status).toBe("completed");
    expect(g.used).toEqual(["A1"]);
  });
  it("is idempotent on create and on capture (a retry never pays twice)", async () => {
    const gw = new MockPayments(guard(["A1", "A2"]));
    const a = await gw.createOrder(input());
    const b = await gw.createOrder(input({ approvalId: "A2" }));
    expect(b.id).toBe(a.id);
    expect(await gw.list()).toHaveLength(1);
    gw.simulateBuyerApproval(a.id);
    const first = await gw.captureOrder(a.id, "A1");
    const again = await gw.captureOrder(a.id, "A1");
    expect(again.captureId).toBe(first.captureId);
  });
});

/** Fake PayPal behind the ToolInvoker interface. */
function fakeTools(opts: { getStatus?: () => string } = {}) {
  const calls: { tool: string; params: Record<string, unknown> }[] = [];
  const tools: ToolInvoker = {
    async call(tool, params) {
      calls.push({ tool, params });
      if (tool === "create_order") {
        return JSON.stringify({ id: "5O190127TN364715T", status: "PAYER_ACTION_REQUIRED", links: [
          { rel: "self", href: "https://api.sandbox.paypal.com/v2/checkout/orders/5O1" },
          { rel: "payer-action", href: "https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T" },
        ] });
      }
      if (tool === "get_order") return { id: params.id, status: opts.getStatus?.() ?? "PAYER_ACTION_REQUIRED" };
      return { id: params.id, status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "CAP-1", status: "COMPLETED" }] } }] };
    },
  };
  return { tools, calls };
}

describe("PayPalOrders (fake tools)", () => {
  it("creates an order in major units, returns the buyer link, and dedupes by idempotency key", async () => {
    const { tools, calls } = fakeTools();
    const gw = new PayPalOrders(tools, guard(["A1", "A2"]), undefined, { now: NOW });
    const o = await gw.createOrder(input());
    expect(calls[0]).toMatchObject({ tool: "create_order", params: { currencyCode: "EUR", items: [{ name: "Futsal shoe", quantity: 1, itemCost: 79, itemTotal: 79 }] } });
    expect(o).toMatchObject({ id: "5O190127TN364715T", status: "awaiting_buyer", amountCents: 7900 });
    expect(o.approveUrl).toBe("https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T");
    expect((await gw.createOrder(input({ approvalId: "A2" }))).id).toBe(o.id);
    expect(calls.filter((c) => c.tool === "create_order")).toHaveLength(1);
  });
  it("does not call PayPal at all without an approval", async () => {
    const { tools, calls } = fakeTools();
    const gw = new PayPalOrders(tools, guard([]));
    await expect(gw.createOrder(input())).rejects.toThrow(/not executable/);
    expect(calls).toHaveLength(0);
  });
  it("captures only after the buyer approved; then marks the approval executed", async () => {
    let status = "PAYER_ACTION_REQUIRED";
    const { tools, calls } = fakeTools({ getStatus: () => status });
    const g = guard(["A1"]);
    const gw = new PayPalOrders(tools, g);
    const o = await gw.createOrder(input());
    await expect(gw.captureOrder(o.id, "A1")).rejects.toThrow(/buyer has not approved/);
    expect(calls.some((c) => c.tool === "pay_order")).toBe(false);
    status = "APPROVED";
    const done = await gw.captureOrder(o.id, "A1");
    expect(done).toMatchObject({ status: "completed", captureId: "CAP-1" });
    expect(g.used).toEqual(["A1"]);
  });
  it("a second capture of a completed order does not call pay_order again", async () => {
    let status = "APPROVED";
    const { tools, calls } = fakeTools({ getStatus: () => status });
    const gw = new PayPalOrders(tools, guard(["A1"]));
    const o = await gw.createOrder(input());
    await gw.captureOrder(o.id, "A1");
    status = "COMPLETED";
    await gw.captureOrder(o.id, "A1");
    expect(calls.filter((c) => c.tool === "pay_order")).toHaveLength(1);
  });
});

describe("RestOrdersInvoker (mocked fetch)", () => {
  function mockFetch(handler: (url: string, init: RequestInit, n: number) => { status: number; body: unknown }) {
    const calls: { url: string; init: RequestInit }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const r = handler(url, init, calls.length);
      return new Response(JSON.stringify(r.body), { status: r.status });
    }) as unknown as typeof fetch;
    return { f, calls };
  }
  const ok = (url: string) => (url.endsWith("/v1/oauth2/token") ? { status: 200, body: { access_token: "tok" } } : { status: 201, body: { id: "O1", status: "CREATED" } });

  it("authenticates, then posts an EUR order with the right amounts and idempotency header", async () => {
    const { f, calls } = mockFetch((u) => ok(u));
    const inv = new RestOrdersInvoker("id", "secret", { fetch: f });
    await inv.call("create_order", { currencyCode: "EUR", requestId: "key-1", notes: "Mandate abc", returnUrl: "http://r", cancelUrl: "http://c",
      items: [{ name: "Shoe", quantity: 2, itemCost: 39.5, itemTotal: 79 }] });
    expect(calls[0].url).toBe("https://api-m.sandbox.paypal.com/v1/oauth2/token");
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from("id:secret").toString("base64")}`);
    expect(calls[1].url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders");
    const h = calls[1].init.headers as Record<string, string>;
    expect(h.authorization).toBe("Bearer tok");
    expect(h["paypal-request-id"]).toBe("key-1");
    const body = JSON.parse(calls[1].init.body as string);
    expect(body.intent).toBe("CAPTURE");
    expect(body.purchase_units[0].amount).toEqual({ currency_code: "EUR", value: "79.00", breakdown: { item_total: { currency_code: "EUR", value: "79.00" } } });
    expect(body.purchase_units[0].items[0]).toEqual({ name: "Shoe", quantity: "2", unit_amount: { currency_code: "EUR", value: "39.50" } });
  });
  it("refreshes the token once after a 401, and routes get/capture to the right paths", async () => {
    let apiCalls = 0;
    const { f, calls } = mockFetch((u) => {
      if (u.endsWith("/v1/oauth2/token")) return { status: 200, body: { access_token: `tok${calls.length}` } };
      return ++apiCalls === 1 ? { status: 401, body: {} } : { status: 200, body: { id: "O1", status: "APPROVED" } };
    });
    const inv = new RestOrdersInvoker("id", "secret", { fetch: f });
    expect(await inv.call("get_order", { id: "O1" })).toMatchObject({ status: "APPROVED" });
    expect(calls.filter((c) => c.url.endsWith("/token"))).toHaveLength(2);
    await inv.call("pay_order", { id: "O1" });
    expect(calls.at(-1)!.url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders/O1/capture");
    expect(calls.at(-1)!.init.method).toBe("POST");
  });
  it("throws readable errors without leaking credentials", async () => {
    const { f } = mockFetch((u) => (u.endsWith("/token") ? { status: 401, body: {} } : { status: 200, body: {} }));
    const err = await new RestOrdersInvoker("id", "very-secret", { fetch: f }).call("get_order", { id: "O1" }).catch((e: Error) => e);
    expect((err as Error).message).toMatch(/auth failed with HTTP 401/);
    expect((err as Error).message).not.toContain("very-secret");
    await expect(new RestOrdersInvoker("id", "s", { fetch: f }).call("nope", {})).rejects.toThrow();
    expect(() => new RestOrdersInvoker("", "")).toThrow(/required/);
  });
});

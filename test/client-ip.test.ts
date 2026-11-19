import { describe, expect, it } from "vitest";
import { clientIpFrom } from "../src/server/clientIp.js";
import { RateLimiter } from "../src/server/limits.js";
import { createApp } from "../src/server/app.js";
import { ApprovalQueue } from "../src/approval/queue.js";
import { FixtureCatalog } from "../src/catalog/FixtureCatalog.js";
import { MockPayments } from "../src/payments/MockPayments.js";
import { MandateService } from "../src/service/service.js";
import { MemoryTracer } from "../src/trace/trace.js";

describe("clientIpFrom: a client-supplied X-Forwarded-For never picks the visitor", () => {
  it("with one trusted proxy it takes the entry the proxy appended (the last one), not the first", () => {
    expect(clientIpFrom({ forwardedFor: "1.1.1.1, 9.9.9.9", trustedProxies: 1 })).toBe("9.9.9.9");
    expect(clientIpFrom({ forwardedFor: "9.9.9.9", trustedProxies: 1 })).toBe("9.9.9.9");
  });
  it("with two trusted proxies it takes the second from the right", () => {
    expect(clientIpFrom({ forwardedFor: "6.6.6.6, 9.9.9.9, 10.0.0.2", trustedProxies: 2 })).toBe("9.9.9.9");
  });
  it("by default (0) the header is ignored and the socket address is used", () => {
    expect(clientIpFrom({ forwardedFor: "1.2.3.4", socketIp: "7.7.7.7" })).toBe("7.7.7.7");
    expect(clientIpFrom({ forwardedFor: "1.2.3.4" })).toBe("local");
  });
  it("a header with fewer entries than trusted proxies is not ours: fall back, never to what the client wrote", () => {
    expect(clientIpFrom({ forwardedFor: "1.2.3.4", socketIp: "7.7.7.7", trustedProxies: 2 })).toBe("7.7.7.7");
    expect(clientIpFrom({ forwardedFor: "", socketIp: "7.7.7.7", trustedProxies: 1 })).toBe("7.7.7.7");
  });
});

describe("the per-visitor limit survives a rotating forged header", () => {
  function app(trustedProxies: number) {
    const now = () => new Date("2026-11-12T10:00:00Z");
    const tracer = new MemoryTracer(now);
    const approvals = new ApprovalQueue(tracer, "run", now);
    const payments = new MockPayments(approvals, tracer, { now, traceId: "run" });
    const service = new MandateService({ catalog: new FixtureCatalog({ now }), attackCatalog: new FixtureCatalog({ now }), payments, approvals, tracer, runId: "run", now });
    return createApp(service, { demoMode: "mock", currency: "EUR", trustedProxies }, new RateLimiter(12, 0));
  }
  const draft = (a: ReturnType<typeof app>, xff: string) =>
    a.request("/api/mandate/draft", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": xff }, body: JSON.stringify({ text: "indoor shoes max 90 €" }) });

  it("with one trusted proxy the 13th request in an hour is refused even when the forged first entry changes every time", async () => {
    const a = app(1);
    const statuses: number[] = [];
    for (let i = 0; i < 13; i++) statuses.push((await draft(a, `10.0.0.${i}, 9.9.9.9`)).status);
    expect(statuses.slice(0, 12).every((s) => s === 200)).toBe(true);
    expect(statuses[12]).toBe(429);
  });
  it("another real visitor (a different proxy-appended address) has their own allowance", async () => {
    const a = app(1);
    for (let i = 0; i < 12; i++) await draft(a, `10.0.0.${i}, 9.9.9.9`);
    expect((await draft(a, "1.1.1.1, 8.8.8.8")).status).toBe(200);
  });
});

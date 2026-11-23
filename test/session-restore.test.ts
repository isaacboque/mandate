import { describe, expect, it } from "vitest";
import { ApprovalQueue } from "../src/approval/queue.js";
import { FixtureCatalog } from "../src/catalog/FixtureCatalog.js";
import { MockPayments } from "../src/payments/MockPayments.js";
import { createApp } from "../src/server/app.js";
import { SessionStore } from "../src/server/sessions.js";
import { MandateService } from "../src/service/service.js";
import { MemoryTracer } from "../src/trace/trace.js";

function makeService(id: string) {
  const tracer = new MemoryTracer();
  const approvals = new ApprovalQueue(tracer, id);
  return new MandateService({ catalog: new FixtureCatalog(), attackCatalog: new FixtureCatalog(), payments: new MockPayments(approvals, tracer, { traceId: id }), approvals, tracer, runId: id, idPrefix: id.slice(0, 6) });
}
const STALE = "11111111-2222-3333-4444-555555555555"; // well formed, unknown to this (restarted) server
const config = { demoMode: "mock" as const, catalog: "fixtures" as const, currency: "EUR" };
const call = (app: ReturnType<typeof createApp>, path: string, cookie?: string) =>
  app.request(path, { headers: cookie ? { cookie } : {} });
const sid = (res: Response) => /mandate_sid=([0-9a-f-]{36})/.exec(res.headers.get("set-cookie") ?? "")?.[1];

describe("a stale session cookie after a restart", () => {
  it("keeps the id the browser sent, so it does not get a new random one", async () => {
    const store = new SessionStore(makeService);
    const app = createApp(store, config);
    const res = await call(app, "/api/config", `mandate_sid=${STALE}`);
    expect(sid(res)).toBe(STALE);
  });

  it("concurrent requests with one stale cookie converge on ONE session", async () => {
    const store = new SessionStore(makeService);
    const app = createApp(store, config);
    const paths = ["/api/config", "/api/mandates", "/api/drafts", "/api/amendments", "/api/proposals", "/api/mandate"];
    const results = await Promise.all(paths.map((p) => call(app, p, `mandate_sid=${STALE}`)));
    expect(new Set(results.map(sid))).toEqual(new Set([STALE]));
    expect(store.size).toBe(1);
  });

  it("a missing or malformed cookie still gets a new random id", async () => {
    const app = createApp(new SessionStore(makeService), config);
    for (const cookie of [undefined, "mandate_sid=not-a-real-id", `mandate_sid=${STALE}0`]) {
      const id = sid(await call(app, "/api/config", cookie));
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(id).not.toBe(STALE);
    }
  });

  it("the cap still evicts the oldest", async () => {
    let t = 0;
    const store = new SessionStore(makeService, { max: 2, now: () => t });
    const app = createApp(store, config);
    for (const id of ["a".repeat(8) + "-0000-0000-0000-000000000001", "a".repeat(8) + "-0000-0000-0000-000000000002", "a".repeat(8) + "-0000-0000-0000-000000000003"]) {
      t += 1000;
      await call(app, "/api/config", `mandate_sid=${id}`);
    }
    expect(store.size).toBe(2);
  });

  it("/api/config says once that the session was restored; a first visit or a known session says nothing", async () => {
    const app = createApp(new SessionStore(makeService), config);
    const fresh = await call(app, "/api/config");
    expect((await fresh.json()).restored).toBe(false);
    const stale = await call(app, "/api/config", `mandate_sid=${STALE}`);
    expect((await stale.json()).restored).toBe(true);
    const again = await call(app, "/api/config", `mandate_sid=${STALE}`);
    expect((await again.json()).restored).toBe(false);
  });

  it("the flag survives when another route was the first to recreate the session", async () => {
    const app = createApp(new SessionStore(makeService), config);
    await call(app, "/api/proposals", `mandate_sid=${STALE}`);
    expect((await (await call(app, "/api/config", `mandate_sid=${STALE}`)).json()).restored).toBe(true);
  });
});

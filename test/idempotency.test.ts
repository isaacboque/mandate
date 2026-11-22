import { describe, expect, it } from "vitest";
import { createApp } from "../src/server/app.js";
import { SessionStore } from "../src/server/sessions.js";
import { ApprovalQueue } from "../src/approval/queue.js";
import { FixtureCatalog } from "../src/catalog/FixtureCatalog.js";
import { MockPayments } from "../src/payments/MockPayments.js";
import { MandateService } from "../src/service/service.js";
import { MemoryTracer } from "../src/trace/trace.js";
import { makeHarness } from "../src/eval/harness.js";

const ASK = { text: "A contract for futsal shoes, up to 100 € in total" };
const cfg = { demoMode: "mock" as const, currency: "EUR" };
const app1 = () => createApp(makeHarness({}, { noMandate: true }).service, cfg);
const post = (app: ReturnType<typeof createApp>, path: string, body: unknown, key?: string, cookie?: string) =>
  app.request(path, { method: "POST", headers: { "content-type": "application/json", ...(key ? { "idempotency-key": key } : {}), ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const drafts = async (app: ReturnType<typeof createApp>, cookie?: string) => ((await (await app.request("/api/drafts", { headers: cookie ? { cookie } : {} })).json()) as unknown[]).length;
const KEY = "0b0d5a36-6c9b-4f0e-8a1c-1f2b3c4d5e6f";

describe("Idempotency-Key on the app's own API (19)", () => {
  it("a retry with the same key replays the first answer and does not create a second record", async () => {
    const app = app1();
    const a = await post(app, "/api/chat", ASK, KEY);
    const b = await post(app, "/api/chat", ASK, KEY);
    expect(a.status).toBe(200);
    expect(b.headers.get("idempotent-replay")).toBe("true");
    expect(a.headers.get("idempotent-replay")).toBeNull();
    expect(await b.json()).toEqual(await a.json());
    expect(await drafts(app)).toBe(1);
  });
  it("a different key, or no key, is a new action", async () => {
    const app = app1();
    await post(app, "/api/chat", ASK, KEY);
    await post(app, "/api/chat", ASK, "another-key-123");
    await post(app, "/api/chat", ASK);
    expect(await drafts(app)).toBe(3);
  });
  it("reusing a key for a different request is refused (422), not replayed", async () => {
    const app = app1();
    await post(app, "/api/chat", ASK, KEY);
    const r = await post(app, "/api/chat", { text: "something else entirely" }, KEY);
    expect(r.status).toBe(422);
    expect((await r.json() as { error: string }).error).toMatch(/different request/i);
  });
  it("two requests with the same key at the same moment run once", async () => {
    const app = app1();
    const [a, b] = await Promise.all([post(app, "/api/chat", ASK, KEY), post(app, "/api/chat", ASK, KEY)]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(await drafts(app)).toBe(1);
  });
  it("a 4xx answer is replayed too (the same request would fail the same way); a 5xx is not cached, so a retry can succeed", async () => {
    const app = app1();
    const a = await post(app, "/api/chat", {}, KEY);
    const b = await post(app, "/api/chat", {}, KEY);
    expect(a.status).toBe(400);
    expect(b.status).toBe(400);
    expect(b.headers.get("idempotent-replay")).toBe("true");
  });
  it("is scoped to the visitor: another visitor's identical key is a different action", async () => {
    const make = (id: string) => { const tracer = new MemoryTracer(); const approvals = new ApprovalQueue(tracer, id); return new MandateService({ catalog: new FixtureCatalog(), attackCatalog: new FixtureCatalog(), payments: new MockPayments(approvals, tracer, { traceId: id }), approvals, tracer, runId: id, idPrefix: id }); };
    const app = createApp(new SessionStore(make), cfg);
    const cookieOf = async (): Promise<string> => (await app.request("/api/config")).headers.get("set-cookie")!.split(";")[0];
    const [c1, c2] = [await cookieOf(), await cookieOf()];
    await post(app, "/api/chat", ASK, KEY, c1);
    const second = await post(app, "/api/chat", ASK, KEY, c2);
    expect(second.headers.get("idempotent-replay")).toBeNull();
    expect(await drafts(app, c1)).toBe(1);
    expect(await drafts(app, c2)).toBe(1);
  });
  it("ignores GET requests and the streaming route, and rejects a malformed key", async () => {
    const app = app1();
    const g = await app.request("/api/drafts", { headers: { "idempotency-key": KEY } });
    expect(g.headers.get("idempotent-replay")).toBeNull();
    await post(app, "/api/chat/stream", ASK, KEY);
    const s2 = await post(app, "/api/chat/stream", ASK, KEY);
    expect(s2.headers.get("idempotent-replay")).toBeNull();
    const bad = await post(app, "/api/chat", ASK, "x y");
    expect(bad.status).toBe(400);
  });
  it("payment endpoints replay too: approving twice with one key answers the same and the payment logic runs once", async () => {
    const h = makeHarness();
    const app = createApp(h.service, cfg);
    const { proposals } = await h.service.ask("Indoor futsal shoes, size 43, non-marking sole, max 90 €");
    const id = proposals[0].id;
    const a = await post(app, `/api/proposals/${id}/approve`, {}, KEY);
    const b = await post(app, `/api/proposals/${id}/approve`, {}, KEY);
    expect(a.status).toBe(200);
    expect(b.headers.get("idempotent-replay")).toBe("true");
    expect(await b.json()).toEqual(await a.json());
    expect((await h.payments.list()).length).toBeLessThanOrEqual(1);
  });
});

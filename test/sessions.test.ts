import { describe, expect, it } from "vitest";
import { ApprovalQueue } from "../src/approval/queue.js";
import { FixtureCatalog } from "../src/catalog/FixtureCatalog.js";
import { MockPayments } from "../src/payments/MockPayments.js";
import { createApp } from "../src/server/app.js";
import { serviceFromEnv } from "../src/server/deps.js";
import { RateLimiter } from "../src/server/limits.js";
import { SessionStore } from "../src/server/sessions.js";
import { MandateService } from "../src/service/service.js";
import { MemoryTracer } from "../src/trace/trace.js";

const MANDATE = {
  currency: "EUR", totalBudgetCents: 10000, perItemCapCents: 10000, allowedCategories: ["shoes"], maxQuantityPerItem: 1,
  expiresAt: new Date(Date.now() + 8 * 3600 * 1000).toISOString(), autonomy: { mode: "ask_always" },
};
const ASK = "Indoor futsal shoes, size 43, non-marking sole, max 90 €";

function makeService(id: string) {
  const tracer = new MemoryTracer();
  const approvals = new ApprovalQueue(tracer, id);
  return new MandateService({ catalog: new FixtureCatalog(), attackCatalog: new FixtureCatalog(), payments: new MockPayments(approvals, tracer, { traceId: id }), approvals, tracer, runId: id, idPrefix: id.slice(0, 6) });
}

/** A browser: remembers the session cookie between requests. */
function browser(app: ReturnType<typeof createApp>, headers: Record<string, string> = {}) {
  let cookie = "";
  return {
    get cookie() { return cookie; },
    set cookie(v: string) { cookie = v; },
    async call(path: string, body?: unknown) {
      const res = await app.request(path, {
        method: body === undefined ? "GET" : "POST",
        headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const set = res.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0];
      return { res, json: (await res.json().catch(() => ({}))) as any, set };
    },
  };
}

describe("one session per visitor", () => {
  it("a visitor's mandate, proposals and budget are invisible to everyone else", async () => {
    const app = createApp(new SessionStore(makeService), { demoMode: "mock", currency: "EUR" });
    const a = browser(app);
    const b = browser(app);
    await a.call("/api/mandate", MANDATE);
    const asked = await a.call("/api/ask", { text: ASK });
    expect(asked.json.proposals).toHaveLength(1);
    expect((await a.call("/api/proposals")).json).toHaveLength(1);
    expect((await a.call("/api/config")).json.mandate).not.toBeNull();

    expect((await b.call("/api/config")).json.mandate).toBeNull();
    expect((await b.call("/api/proposals")).json).toEqual([]);
    await b.call("/api/mandate", { ...MANDATE, totalBudgetCents: 5000 });
    // B cannot read or act on A's proposal
    const id = asked.json.proposals[0].id;
    expect((await b.call(`/api/proposals/${id}/approve`, {})).res.status).toBe(400);
    expect((await a.call("/api/config")).json.mandate.mandate.totalBudgetCents).toBe(10000);
  });

  it("budget spent by one visitor does not reduce another's", async () => {
    const app = createApp(new SessionStore(makeService), { demoMode: "mock", currency: "EUR" });
    const a = browser(app);
    const b = browser(app);
    await a.call("/api/mandate", MANDATE);
    await b.call("/api/mandate", MANDATE);
    const p = (await a.call("/api/ask", { text: ASK })).json.proposals[0];
    await a.call(`/api/proposals/${p.id}/approve`, {});
    await a.call(`/api/proposals/${p.id}/pay`, {});
    expect((await a.call("/api/config")).json.spentCents).toBe(7900);
    expect((await b.call("/api/config")).json.spentCents).toBe(0);
  });

  it("proposal ids differ between visitors (they feed the PayPal idempotency key)", async () => {
    const app = createApp(new SessionStore(makeService), { demoMode: "mock", currency: "EUR" });
    const a = browser(app);
    const b = browser(app);
    await a.call("/api/mandate", MANDATE);
    await b.call("/api/mandate", MANDATE);
    const ia = (await a.call("/api/ask", { text: ASK })).json.proposals[0].id;
    const ib = (await b.call("/api/ask", { text: ASK })).json.proposals[0].id;
    expect(ia).not.toBe(ib);
  });

  it("sets an HttpOnly, SameSite=Lax cookie; Secure behind https; a garbage cookie gets a fresh session", async () => {
    const app = createApp(new SessionStore(makeService), { demoMode: "mock", currency: "EUR" });
    const plain = await browser(app).call("/api/config");
    expect(plain.set).toMatch(/mandate_sid=[0-9a-f-]{36}/);
    expect(plain.set).toMatch(/HttpOnly/i);
    expect(plain.set).toMatch(/SameSite=Lax/i);
    expect(plain.set).not.toMatch(/Secure/i);
    const https = await browser(app, { "x-forwarded-proto": "https" }).call("/api/config");
    expect(https.set).toMatch(/Secure/i);
    const junk = browser(app);
    junk.cookie = "mandate_sid=not-a-real-id";
    const r = await junk.call("/api/config");
    expect(r.res.status).toBe(200);
    expect(r.json.mandate).toBeNull();
    expect(junk.cookie).toMatch(/mandate_sid=[0-9a-f-]{36}/);
  });

  it("idle sessions expire and the oldest is dropped at the cap", async () => {
    let t = 1_000_000;
    const store = new SessionStore(makeService, { ttlMs: 60_000, max: 2, now: () => t });
    const app = createApp(store, { demoMode: "mock", currency: "EUR" });
    const a = browser(app);
    await a.call("/api/mandate", MANDATE);
    t += 61_000;
    expect((await a.call("/api/config")).json.mandate).toBeNull(); // expired: fresh session
    const b = browser(app);
    const c = browser(app);
    await b.call("/api/mandate", MANDATE);
    t += 1;
    await c.call("/api/mandate", MANDATE);
    expect(store.size).toBe(2); // a's replacement was the oldest and made room
  });
});

describe("rate limits protect the free quotas", () => {
  it("limits searches per visitor per hour, then lets the window slide", () => {
    let t = 0;
    const l = new RateLimiter(2, 0, () => t);
    expect(l.hit("1.1.1.1").ok).toBe(true);
    expect(l.hit("1.1.1.1").ok).toBe(true);
    const third = l.hit("1.1.1.1");
    expect(third.ok).toBe(false);
    expect(l.hit("2.2.2.2").ok).toBe(true); // someone else is unaffected
    t += 3600_001;
    expect(l.hit("1.1.1.1").ok).toBe(true);
  });
  it("has a daily cap for the whole instance, and 0 turns a limit off", () => {
    let t = 0;
    const l = new RateLimiter(0, 3, () => t);
    for (const ip of ["a", "b", "c"]) expect(l.hit(ip).ok).toBe(true);
    const over = l.hit("d");
    expect(over.ok).toBe(false);
    t += 24 * 3600_000 + 1;
    expect(l.hit("d").ok).toBe(true);
    expect(new RateLimiter(0, 0).hit("x").ok).toBe(true);
    expect(new RateLimiter(0, 0).enabled).toBe(false);
  });
  it("the API answers 429 with a readable message and does not call the agent", async () => {
    const app = createApp(new SessionStore(makeService), { demoMode: "mock", currency: "EUR" }, new RateLimiter(1, 0));
    const a = browser(app, { "x-forwarded-for": "9.9.9.9, 10.0.0.1" });
    await a.call("/api/mandate", MANDATE);
    expect((await a.call("/api/ask", { text: ASK })).res.status).toBe(200);
    const second = await a.call("/api/ask", { text: ASK });
    expect(second.res.status).toBe(429);
    expect(second.json.error).toMatch(/Demo limit reached/);
    expect((await a.call("/api/proposals")).json).toHaveLength(1); // the second ask did nothing
  });
});

describe("environment wiring", () => {
  it("demo mode: no keys, no limits; live mode: PayPal sandbox gateway and limits on by default", () => {
    const demo = serviceFromEnv({});
    expect(demo.makeService("abc123").isMock).toBe(true);
    expect(demo.limiter.enabled).toBe(false);
    const live = serviceFromEnv({ DEMO_MODE: "live", CHANNEL3_API_KEY: "k", PAYPAL_CLIENT_ID: "i", PAYPAL_CLIENT_SECRET: "s", RENDER_EXTERNAL_URL: "https://x.onrender.com/" });
    expect(live.makeService("abc123").isMock).toBe(false);
    expect(live.limiter.enabled).toBe(true);
    expect(serviceFromEnv({ DEMO_MODE: "live", CHANNEL3_API_KEY: "k", PAYPAL_CLIENT_ID: "i", PAYPAL_CLIENT_SECRET: "s", RATE_LIMIT_ASKS_PER_HOUR: "0", DAILY_ASK_CAP: "0" }).limiter.enabled).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { Channel3Catalog, Channel3QuotaError, classifyChannel3Failure } from "../src/catalog/Channel3Catalog.js";
import { FixtureCatalog } from "../src/catalog/FixtureCatalog.js";
import { QuotaFallbackCatalog } from "../src/catalog/QuotaFallbackCatalog.js";
import { catalogFromEnv, serviceFromEnv } from "../src/server/deps.js";
import { configFromEnv, createApp } from "../src/server/app.js";

const offer = { url: "https://a.example/x", domain: "a.example", price: { price: 19.99, currency: "eur" }, availability: "InStock" };
const product = { id: "c3_1", title: "White tee", description: "Plain", category: { slug: "tshirts" }, offers: [offer] };

/** A fetch that answers from a script and counts calls. Never touches the network. */
function scripted(steps: (() => Response)[]) {
  let n = 0;
  const fetchFn = (async () => {
    const step = steps[Math.min(n, steps.length - 1)];
    n++;
    return step();
  }) as unknown as typeof fetch;
  return { fetchFn, calls: () => n };
}
const ok = (body: unknown = { products: [product] }) => () => new Response(JSON.stringify(body), { status: 200 });
const fail = (status: number, body = "", headers: Record<string, string> = {}) => () => new Response(body, { status, headers });

describe("how a Channel3 failure is classified", () => {
  it("402 is quota; 403 only when the body speaks of credits or quota", () => {
    expect(classifyChannel3Failure(402, "")).toBe("quota");
    expect(classifyChannel3Failure(403, '{"detail":"Monthly quota exceeded"}')).toBe("quota");
    expect(classifyChannel3Failure(403, "You are out of credits")).toBe("quota");
    expect(classifyChannel3Failure(403, "forbidden")).toBeNull();
  });
  it("429 is quota unless it reads as a short per-minute limit", () => {
    expect(classifyChannel3Failure(429, "")).toBe("quota");
    expect(classifyChannel3Failure(429, "Monthly request limit reached")).toBe("quota");
    expect(classifyChannel3Failure(429, "Rate limit exceeded: too many requests per minute")).toBe("rate");
    expect(classifyChannel3Failure(429, "", 30)).toBe("rate");
  });
  it("other statuses are not a quota problem", () => {
    for (const s of [400, 401, 500, 503]) expect(classifyChannel3Failure(s, "credits quota")).toBeNull();
  });
});

describe("Channel3Catalog raises a typed quota error", () => {
  it("quota status: a Channel3QuotaError of kind quota, without the key", async () => {
    const f = scripted([fail(402, "no credits")]);
    const cat = new Channel3Catalog("secret-key", { fetch: f.fetchFn });
    const err = await cat.search("tee").catch((e) => e);
    expect(err).toBeInstanceOf(Channel3QuotaError);
    expect(err.kind).toBe("quota");
    expect(err.message).not.toMatch(/secret-key/);
  });
  it("a per-minute limit is kind rate and does not mark the month as used up", async () => {
    const f = scripted([fail(429, "Rate limit: too many requests per minute", { "retry-after": "20" }), ok()]);
    const cat = new Channel3Catalog("k", { fetch: f.fetchFn });
    const err = await cat.search("tee").catch((e) => e);
    expect(err).toBeInstanceOf(Channel3QuotaError);
    expect(err.kind).toBe("rate");
    expect(cat.exhaustedUntil()).toBeNull();
    expect((await cat.search("tee again")).length).toBe(1);
  });
  it("after a quota error it refuses to call again until the 1st of next month (UTC)", async () => {
    let now = new Date("2026-11-23T10:00:00Z");
    const f = scripted([fail(402), ok()]);
    const cat = new Channel3Catalog("k", { fetch: f.fetchFn, now: () => now });
    await expect(cat.search("a")).rejects.toBeInstanceOf(Channel3QuotaError);
    expect(cat.exhaustedUntil()?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    await expect(cat.search("b")).rejects.toBeInstanceOf(Channel3QuotaError);
    expect(f.calls()).toBe(1); // the second one never reached the provider
    now = new Date("2026-12-01T00:00:01Z");
    expect(cat.exhaustedUntil()).toBeNull();
    expect((await cat.search("c")).length).toBe(1);
  });
  it("a failed category lookup still returns nothing, but the quota flag is set", async () => {
    const cat = new Channel3Catalog("k", { fetch: scripted([fail(402)]).fetchFn, now: () => new Date("2026-11-23T10:00:00Z") });
    expect(await cat.categories("shoes")).toEqual([]);
    expect(cat.exhaustedUntil()).not.toBeNull();
  });
});

describe("soft cap CHANNEL3_MONTHLY_BUDGET", () => {
  it("counts requests this UTC month and stops before the provider refuses", async () => {
    const now = new Date("2026-11-23T10:00:00Z");
    const f = scripted([ok()]);
    const cat = new Channel3Catalog("k", { fetch: f.fetchFn, now: () => now, monthlyBudget: 2, cacheMs: 0 });
    await cat.search("a");
    await cat.search("b");
    expect(cat.requestsThisMonth()).toBe(2);
    await expect(cat.search("c")).rejects.toMatchObject({ kind: "quota" });
    expect(f.calls()).toBe(2);
    expect(cat.exhaustedUntil()?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });
  it("the counter starts again in a new month", async () => {
    let now = new Date("2026-11-30T23:59:00Z");
    const cat = new Channel3Catalog("k", { fetch: scripted([ok()]).fetchFn, now: () => now, monthlyBudget: 1, cacheMs: 0 });
    await cat.search("a");
    await expect(cat.search("b")).rejects.toBeInstanceOf(Channel3QuotaError);
    now = new Date("2026-12-01T00:00:00Z");
    expect(cat.requestsThisMonth()).toBe(0);
    await expect(cat.search("c")).resolves.toHaveLength(1);
  });
  it("unset budget means no soft cap", async () => {
    const cat = new Channel3Catalog("k", { fetch: scripted([ok()]).fetchFn, cacheMs: 0 });
    for (let i = 0; i < 20; i++) await cat.search(`q${i}`);
    expect(cat.exhaustedUntil()).toBeNull();
  });
});

describe("QuotaFallbackCatalog", () => {
  const NOW = () => new Date("2026-11-23T10:00:00Z");
  const make = (steps: (() => Response)[]) => {
    const f = scripted(steps);
    const primary = new Channel3Catalog("k", { fetch: f.fetchFn, now: NOW });
    return { primary, f, cat: new QuotaFallbackCatalog(primary, new FixtureCatalog({ now: NOW })) };
  };

  it("while the quota holds, products come from the real catalog and the flag is off", async () => {
    const { cat } = make([ok()]);
    expect((await cat.search("tee")).map((p) => p.id)).toEqual(["c3_1"]);
    expect(cat.status()).toEqual({ exhausted: false });
  });
  it("quota error: the same search is answered by the fixtures and the flag is set with the date", async () => {
    const { cat } = make([fail(402)]);
    const r = await cat.search("indoor futsal shoes");
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((p) => !p.id.startsWith("c3_"))).toBe(true);
    expect(cat.status()).toEqual({ exhausted: true, until: "2026-12-01T00:00:00.000Z" });
  });
  it("once exhausted, later searches do not call the provider at all", async () => {
    const { cat, f } = make([fail(402)]);
    await cat.search("shoes");
    await cat.search("socks");
    expect(f.calls()).toBe(1);
  });
  it("a per-minute rate limit is not hidden behind the demo catalog: it surfaces as a busy error", async () => {
    const { cat } = make([fail(429, "too many requests per minute", { "retry-after": "10" })]);
    await expect(cat.search("tee")).rejects.toThrow(/busy.*shortly/i);
    expect(cat.status().exhausted).toBe(false);
  });
  it("categories fall back to the fixtures too", async () => {
    const { cat } = make([fail(402)]);
    await cat.categories("shoes");
    expect(cat.status().exhausted).toBe(true);
    expect(Array.isArray(await cat.categories("shoes"))).toBe(true);
  });
  it("fail closed: a real product cannot be re-priced once the quota is gone", async () => {
    const { cat } = make([ok({ products: [product] }), fail(402)]);
    await cat.search("tee"); // c3_1 now known as a Channel3 product
    await expect(cat.getProduct("c3_1")).rejects.toThrow(/cannot be verified/i);
  });
  it("a fixture product stays checkable while the real catalog is out", async () => {
    const { cat } = make([fail(402)]);
    const [first] = await cat.search("indoor futsal shoes");
    expect((await cat.getProduct(first.id))?.id).toBe(first.id);
  });
});

describe("wiring", () => {
  it("catalogFromEnv still builds a plain Channel3Catalog; the monthly budget comes from the env", () => {
    const env = { CATALOG: "channel3", CHANNEL3_API_KEY: "k", CHANNEL3_MONTHLY_BUDGET: "5" };
    const c = catalogFromEnv(env, configFromEnv(env));
    expect(c).toBeInstanceOf(Channel3Catalog);
  });
  it("/api/config carries the flag, and fixtures-only servers carry none", async () => {
    const env = { CATALOG: "channel3", CHANNEL3_API_KEY: "k" };
    const d = serviceFromEnv(env);
    const app = createApp(d.sessions, d.config, d.limiter, d.categoryLimiter, d.catalogStatus);
    const cfg = await (await app.request("/api/config")).json();
    expect(cfg.catalogQuota).toEqual({ exhausted: false });
    const plain = serviceFromEnv({});
    const app2 = createApp(plain.sessions, plain.config, plain.limiter, plain.categoryLimiter, plain.catalogStatus);
    expect((await (await app2.request("/api/config")).json()).catalogQuota).toBeUndefined();
  });
});

describe("checkout re-check fails closed when the live price cannot be read", () => {
  it("no order is created and the reason says the price cannot be verified", async () => {
    const { ApprovalQueue } = await import("../src/approval/queue.js");
    const { MockPayments } = await import("../src/payments/MockPayments.js");
    const { MandateService } = await import("../src/service/service.js");
    const { MemoryTracer } = await import("../src/trace/trace.js");
    const now = () => new Date("2026-11-12T10:00:00Z");
    const fixtures = new FixtureCatalog({ now });
    let quotaGone = false;
    const catalog = {
      name: "flaky",
      search: (q: string, o?: Parameters<FixtureCatalog["search"]>[1]) => fixtures.search(q, o),
      getProduct: async (id: string) => {
        if (quotaGone) throw new Error(`the live price of ${id} cannot be verified: The real catalog's monthly quota is used up`);
        return fixtures.getProduct(id);
      },
    };
    const tracer = new MemoryTracer(now);
    const approvals = new ApprovalQueue(tracer, "run", now);
    const payments = new MockPayments(approvals, tracer, { now, traceId: "run" });
    const service = new MandateService({ catalog, attackCatalog: fixtures, payments, approvals, tracer, runId: "run", now });
    service.setMandate({ currency: "EUR", totalBudgetCents: 9000, perItemCapCents: 9000, allowedCategories: ["shoes"], maxQuantityPerItem: 1, expiresAt: "2026-11-12T18:00:00Z", autonomy: { mode: "ask_always" } });
    const p = (await service.ask("Indoor futsal shoes, size 43, non-marking sole, max 90 €")).proposals[0];
    expect(p.status).toBe("pending");
    quotaGone = true;
    const after = await service.approve(p.id);
    expect(after.status).toBe("failed");
    expect(after.error).toMatch(/cannot be verified/);
    expect(await payments.list()).toHaveLength(0);
  });
});

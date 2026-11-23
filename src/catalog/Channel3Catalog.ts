import { productLooksPoisoned } from "./injection.js";
import type { CatalogGateway, CategoryHit, Product, SearchOptions } from "./types.js";

const BASE = "https://api.trychannel3.com";

type C3Offer = { url?: string; domain?: string; price?: { price?: number; currency?: string }; availability?: string };
type C3Product = {
  id: string;
  title?: string;
  description?: string | null;
  category?: { slug?: string; title?: string; path?: ({ slug?: string; title?: string } | string)[] } | null;
  offers?: C3Offer[];
  structured_attributes?: Record<string, string[]> | null;
  images?: { url?: string; is_main_image?: boolean }[] | null;
  variants?: { options?: { name?: string; values?: { label?: string; exists?: boolean }[] }[] } | null;
};

/** The provider's monthly quota is used up (`quota`), or it is answering too fast for a moment (`rate`). Never carries the key. */
export class Channel3QuotaError extends Error {
  constructor(readonly kind: "quota" | "rate", message: string, readonly until?: Date) {
    super(message);
    this.name = "Channel3QuotaError";
  }
}

/**
 * Tells quota exhaustion from a per-minute rate limit and from other failures. Channel3's docs were not reachable when this was written,
 * so the rule is conservative: 402 is quota; 403 only when the body speaks of credits or quota; 429 is quota unless it reads as a short
 * per-minute limit (a Retry-After of up to 5 minutes, or "per minute"/"rate limit" without any mention of month, quota or credits).
 */
export function classifyChannel3Failure(status: number, body: string, retryAfterSec?: number): "quota" | "rate" | null {
  const text = body.toLowerCase();
  const mentionsQuota = /quota|credit|month/.test(text);
  if (status === 402) return "quota";
  if (status === 403) return mentionsQuota ? "quota" : null;
  if (status === 429) {
    if (mentionsQuota) return "quota";
    if ((retryAfterSec !== undefined && retryAfterSec > 0 && retryAfterSec <= 300) || /per (minute|second)|rate.?limit|too many requests/.test(text)) return "rate";
    return "quota";
  }
  return null;
}

/** First instant of the next calendar month, UTC. */
function nextMonthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

/**
 * Real catalog via Channel3 (https://channel3.ai/docs). Prices in the API are decimal major units
 * (e.g. 49.99); we convert to integer cents. We take the cheapest in-stock offer.
 */
export class Channel3Catalog implements CatalogGateway {
  readonly name = "channel3";
  /** Identical searches within `cacheMs` (default 5 min) reuse the last answer: saves free-tier quota. getProduct is never cached. */
  private cache = new Map<string, { at: number; products: Product[] }>();
  private catCache = new Map<string, { at: number; hits: CategoryHit[] }>();

  constructor(
    private apiKey: string,
    private opts: { fetch?: typeof fetch; now?: () => Date; currency?: string; cacheMs?: number; monthlyBudget?: number } = {},
  ) {
    if (!apiKey) throw new Error("CHANNEL3_API_KEY is not set");
  }

  private clock(): Date {
    return (this.opts.now ?? (() => new Date()))();
  }

  /** Requests made this UTC month by this process (resets on restart and on the 1st). */
  private month = "";
  private count = 0;
  private roll(): void {
    const m = this.clock().toISOString().slice(0, 7);
    if (m !== this.month) { this.month = m; this.count = 0; }
  }
  requestsThisMonth(): number {
    this.roll();
    return this.count;
  }

  private blockedUntil: Date | null = null;
  /** When the quota is used up (provider said so, or the soft cap CHANNEL3_MONTHLY_BUDGET is reached): the 1st of next month (UTC). Null otherwise. */
  exhaustedUntil(): Date | null {
    const now = this.clock();
    if (this.blockedUntil && now >= this.blockedUntil) this.blockedUntil = null;
    if (this.blockedUntil) return this.blockedUntil;
    const budget = this.opts.monthlyBudget;
    if (budget && budget > 0 && this.requestsThisMonth() >= budget) return nextMonthStart(now);
    return null;
  }

  private async call(path: string, init: RequestInit): Promise<unknown> {
    const until = this.exhaustedUntil();
    if (until) throw new Channel3QuotaError("quota", "The real catalog's monthly quota is used up", until);
    const f = this.opts.fetch ?? fetch;
    this.roll();
    this.count++;
    const res = await f(`${BASE}${path}`, {
      ...init,
      headers: { "x-api-key": this.apiKey, "content-type": "application/json", ...(init.headers as Record<string, string>) },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const ra = Number(res.headers.get("retry-after"));
      const kind = classifyChannel3Failure(res.status, body, Number.isFinite(ra) ? ra : undefined);
      if (kind === "quota") {
        this.blockedUntil = nextMonthStart(this.clock());
        throw new Channel3QuotaError("quota", "The real catalog's monthly quota is used up", this.blockedUntil);
      }
      if (kind === "rate") throw new Channel3QuotaError("rate", "The real catalog is busy (per-minute limit); try again shortly");
    }
    if (!res.ok) throw new Error(`Channel3 ${init.method ?? "GET"} ${path} failed with HTTP ${res.status}`);
    return res.json();
  }

  async search(query: string, opts: SearchOptions = {}): Promise<Product[]> {
    const ttl = this.opts.cacheMs ?? 5 * 60 * 1000;
    const key = JSON.stringify([query.trim().toLowerCase(), opts.limit ?? 10, opts.maxPriceCents ?? null]);
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.products;
    const body: Record<string, unknown> = { query, limit: opts.limit ?? 10 };
    if (opts.maxPriceCents !== undefined) body.filters = { price: { max_price: opts.maxPriceCents / 100 } };
    const json = (await this.call("/v1/search", { method: "POST", body: JSON.stringify(body) })) as { products?: C3Product[] } | null;
    const products = (json?.products ?? []).map((p) => this.map(p)).filter((p): p is Product => p !== null);
    if (ttl > 0) this.cache.set(key, { at: Date.now(), products });
    return products;
  }

  /** GET /v1/categories/search. Cached a day per query; a failed lookup (credits, outage) returns nothing instead of breaking the form. */
  async categories(query: string, limit = 8): Promise<CategoryHit[]> {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const key = `${q}|${limit}`;
    const hit = this.catCache.get(key);
    if (hit && Date.now() - hit.at < 24 * 3600 * 1000) return hit.hits;
    let json: { categories?: { slug?: string; title?: string; path?: ({ slug?: string; title?: string } | string)[]; has_children?: boolean }[] } | null;
    try {
      json = (await this.call(`/v1/categories/search?query=${encodeURIComponent(q)}&limit=${Math.min(Math.max(limit, 1), 20)}`, { method: "GET" })) as typeof json;
    } catch {
      return []; // the quota flag, if it was a quota error, is already set by call()
    }
    const hits = (json?.categories ?? []).filter((c) => c.slug).map((c) => ({
      slug: c.slug!.toLowerCase(),
      title: c.title ?? c.slug!,
      path: (c.path ?? []).map((e) => (typeof e === "string" ? { slug: e.toLowerCase(), title: e } : { slug: (e.slug ?? "").toLowerCase(), title: e.title ?? e.slug ?? "" })).filter((e) => e.slug),
      hasChildren: Boolean(c.has_children),
    }));
    this.catCache.set(key, { at: Date.now(), hits });
    return hits;
  }

  async getProduct(id: string): Promise<Product | null> {
    const cur = this.opts.currency ? `?currency=${encodeURIComponent(this.opts.currency)}` : "";
    const json = (await this.call(`/v1/products/${encodeURIComponent(id)}${cur}`, { method: "GET" })) as C3Product | null;
    return json ? this.map(json) : null;
  }

  private map(p: C3Product): Product | null {
    // An offer must be in stock and carry a real price: at least one cent, a finite number. A zero, negative or missing
    // price is dropped here, before "cheapest" is chosen, so a bogus free offer can neither win nor hide a valid one.
    const offers = (p.offers ?? []).filter((o) => o.availability === "InStock" && typeof o.price?.price === "number" && toCents(o.price.price) > 0);
    if (offers.length === 0) return null;
    const best = offers.reduce((a, b) => (b.price!.price! < a.price!.price! ? b : a));
    const attributes: Record<string, string> = {};
    for (const [k, v] of Object.entries(p.structured_attributes ?? {})) if (v?.[0]) attributes[k] = v[0];
    // Variant options (size, colour...) list every value the product comes in, joined by "|".
    for (const o of p.variants?.options ?? []) {
      const labels = (o.values ?? []).filter((v) => v.label && v.exists !== false).map((v) => v.label!);
      if (o.name && labels.length) attributes[o.name.toLowerCase()] = labels.join("|");
    }
    const title = p.title ?? "";
    const description = p.description ?? "";
    return {
      id: p.id,
      title,
      description,
      merchant: best.domain ?? "unknown",
      category: (p.category?.slug ?? p.category?.title ?? "").toLowerCase(),
      categoryPath: pathOf(p),
      priceCents: toCents(best.price!.price!),
      currency: (best.price!.currency ?? "").toUpperCase(),
      attributes,
      inStock: true,
      url: best.url ?? "",
      imageUrl: imageOf(p),
      priceCheckedAt: (this.opts.now ?? (() => new Date()))().toISOString(),
      injectionFlag: productLooksPoisoned({ title, description }),
    };
  }
}

/** Decimal major units to integer cents. NaN or Infinity come back as 0, which the caller rejects. */
function toCents(major: number): number {
  const cents = Math.round(major * 100);
  return Number.isSafeInteger(cents) ? cents : 0;
}

/** Main image if the catalog has one. Only https URLs are kept; the UI renders them without a referrer. */
function imageOf(p: C3Product): string | undefined {
  const imgs = p.images ?? [];
  const url = (imgs.find((i) => i.is_main_image) ?? imgs[0])?.url;
  return url && url.startsWith("https://") ? url : undefined;
}

/** Root-to-leaf category slugs from a product's category path (objects or plain strings). */
function pathOf(p: C3Product): string[] | undefined {
  const raw = p.category?.path ?? [];
  const slugs = raw.map((e) => (typeof e === "string" ? e : e?.slug ?? "")).map((s) => s.toLowerCase()).filter(Boolean);
  return slugs.length ? slugs : undefined;
}

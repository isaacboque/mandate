import { productLooksPoisoned } from "./injection.js";
import type { CatalogGateway, Product, SearchOptions } from "./types.js";

const BASE = "https://api.trychannel3.com";

type C3Offer = { url?: string; domain?: string; price?: { price?: number; currency?: string }; availability?: string };
type C3Product = {
  id: string;
  title?: string;
  description?: string | null;
  category?: { slug?: string; title?: string } | null;
  offers?: C3Offer[];
  structured_attributes?: Record<string, string[]> | null;
  images?: { url?: string; is_main_image?: boolean }[] | null;
  variants?: { options?: { name?: string; values?: { label?: string; exists?: boolean }[] }[] } | null;
};

/**
 * Real catalog via Channel3 (https://channel3.ai/docs). Prices in the API are decimal major units
 * (e.g. 49.99); we convert to integer cents. We take the cheapest in-stock offer.
 */
export class Channel3Catalog implements CatalogGateway {
  readonly name = "channel3";
  /** Identical searches within `cacheMs` (default 5 min) reuse the last answer: saves free-tier quota. getProduct is never cached. */
  private cache = new Map<string, { at: number; products: Product[] }>();

  constructor(
    private apiKey: string,
    private opts: { fetch?: typeof fetch; now?: () => Date; currency?: string; cacheMs?: number } = {},
  ) {
    if (!apiKey) throw new Error("CHANNEL3_API_KEY is not set");
  }

  private async call(path: string, init: RequestInit): Promise<unknown> {
    const f = this.opts.fetch ?? fetch;
    const res = await f(`${BASE}${path}`, {
      ...init,
      headers: { "x-api-key": this.apiKey, "content-type": "application/json", ...(init.headers as Record<string, string>) },
    });
    if (res.status === 404) return null;
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

  async getProduct(id: string): Promise<Product | null> {
    const cur = this.opts.currency ? `?currency=${encodeURIComponent(this.opts.currency)}` : "";
    const json = (await this.call(`/v1/products/${encodeURIComponent(id)}${cur}`, { method: "GET" })) as C3Product | null;
    return json ? this.map(json) : null;
  }

  private map(p: C3Product): Product | null {
    const offers = (p.offers ?? []).filter((o) => o.availability === "InStock" && typeof o.price?.price === "number");
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
      priceCents: Math.round(best.price!.price! * 100),
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

/** Main image if the catalog has one. Only https URLs are kept; the UI renders them without a referrer. */
function imageOf(p: C3Product): string | undefined {
  const imgs = p.images ?? [];
  const url = (imgs.find((i) => i.is_main_image) ?? imgs[0])?.url;
  return url && url.startsWith("https://") ? url : undefined;
}

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
};

/**
 * Real catalog via Channel3 (https://channel3.ai/docs). Prices in the API are decimal major units
 * (e.g. 49.99); we convert to integer cents. We take the cheapest in-stock offer.
 */
export class Channel3Catalog implements CatalogGateway {
  readonly name = "channel3";

  constructor(
    private apiKey: string,
    private opts: { fetch?: typeof fetch; now?: () => Date; currency?: string } = {},
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
    const body: Record<string, unknown> = { query, limit: opts.limit ?? 10 };
    if (opts.maxPriceCents !== undefined) body.filters = { price: { max_price: opts.maxPriceCents / 100 } };
    const json = (await this.call("/v1/search", { method: "POST", body: JSON.stringify(body) })) as { products?: C3Product[] } | null;
    return (json?.products ?? []).map((p) => this.map(p)).filter((p): p is Product => p !== null);
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
      priceCheckedAt: (this.opts.now ?? (() => new Date()))().toISOString(),
      injectionFlag: productLooksPoisoned({ title, description }),
    };
  }
}

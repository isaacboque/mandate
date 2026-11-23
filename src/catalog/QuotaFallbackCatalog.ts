import { Channel3QuotaError, type Channel3Catalog } from "./Channel3Catalog.js";
import type { CatalogGateway, CategoryHit, Product, SearchOptions } from "./types.js";

export type CatalogStatus = { exhausted: boolean; until?: string };

/**
 * The real catalog with a fallback for when its monthly quota is gone. Searches and category lookups then use the fixture catalog until the
 * 1st of next month (UTC) or a restart. A per-minute rate limit is not hidden: it surfaces as a "busy" error. Checkout never falls back:
 * a Channel3 product is re-priced by Channel3 or not at all, so with no quota the re-check fails closed ("price cannot be verified").
 */
export class QuotaFallbackCatalog implements CatalogGateway {
  readonly name = "channel3";
  /** Ids that came from the fallback, so their live price is read there and never from the real catalog. */
  private fallbackIds = new Set<string>();

  constructor(private primary: Channel3Catalog, private fallback: CatalogGateway) {}

  status(): CatalogStatus {
    const until = this.primary.exhaustedUntil();
    return until ? { exhausted: true, until: until.toISOString() } : { exhausted: false };
  }

  private async viaFallback(query: string, opts?: SearchOptions): Promise<Product[]> {
    const found = await this.fallback.search(query, opts);
    for (const p of found) this.fallbackIds.add(p.id);
    return found;
  }

  async search(query: string, opts?: SearchOptions): Promise<Product[]> {
    if (this.primary.exhaustedUntil()) return this.viaFallback(query, opts);
    try {
      return await this.primary.search(query, opts);
    } catch (e) {
      if (e instanceof Channel3QuotaError && e.kind === "quota") return this.viaFallback(query, opts);
      throw e;
    }
  }

  async categories(query: string, limit?: number): Promise<CategoryHit[]> {
    if (!this.primary.exhaustedUntil()) {
      const hits = await this.primary.categories(query, limit);
      if (!this.primary.exhaustedUntil()) return hits;
    }
    return (await this.fallback.categories?.(query, limit)) ?? [];
  }

  async getProduct(id: string): Promise<Product | null> {
    if (this.fallbackIds.has(id)) return this.fallback.getProduct(id);
    try {
      return await this.primary.getProduct(id);
    } catch (e) {
      if (e instanceof Channel3QuotaError) throw new Error(`the live price of ${id} cannot be verified: ${e.message}`, { cause: e });
      throw e;
    }
  }
}

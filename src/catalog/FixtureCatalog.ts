import { readFileSync } from "node:fs";
import { productLooksPoisoned } from "./injection.js";
import type { CatalogGateway, Product, SearchOptions } from "./types.js";

type FixtureRow = Omit<Product, "priceCheckedAt" | "injectionFlag" | "url"> & { priceCentsAfterDrift?: number };

export const DEFAULT_FIXTURE_PATH = new URL("../../fixtures/catalog.json", import.meta.url);

const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Deterministic catalog for mock mode, tests and eval.
 * Drift: a product with `priceCentsAfterDrift` shows its listed price in `search`, but
 * `getProduct` (the live read at execution time) returns the new, higher price.
 */
export class FixtureCatalog implements CatalogGateway {
  readonly name = "fixture";
  private rows: FixtureRow[];

  constructor(private opts: { now?: () => Date; rows?: FixtureRow[]; drift?: boolean } = {}) {
    this.rows = opts.rows ?? (JSON.parse(readFileSync(DEFAULT_FIXTURE_PATH, "utf8")) as FixtureRow[]);
  }

  private now() {
    return (this.opts.now ?? (() => new Date()))().toISOString();
  }

  private toProduct(r: FixtureRow, live: boolean): Product {
    const { priceCentsAfterDrift, ...rest } = r;
    const drifted = live && (this.opts.drift ?? true) && priceCentsAfterDrift !== undefined;
    return {
      ...rest,
      priceCents: drifted ? priceCentsAfterDrift : r.priceCents,
      url: `https://${r.merchant}/p/${r.id}`,
      priceCheckedAt: this.now(),
      injectionFlag: productLooksPoisoned(r),
    };
  }

  async search(query: string, opts: SearchOptions = {}): Promise<Product[]> {
    const q = tokens(query);
    const scored = this.rows
      .map((r) => {
        const hay = new Set(tokens(`${r.title} ${r.description} ${r.category} ${Object.values(r.attributes).join(" ")}`));
        return { r, score: q.filter((t) => hay.has(t)).length };
      })
      .filter((x) => x.score > 0 && (opts.maxPriceCents === undefined || x.r.priceCents <= opts.maxPriceCents))
      .sort((a, b) => b.score - a.score || a.r.priceCents - b.r.priceCents || a.r.id.localeCompare(b.r.id));
    return scored.slice(0, opts.limit ?? 10).map((x) => this.toProduct(x.r, false));
  }

  async getProduct(id: string): Promise<Product | null> {
    const r = this.rows.find((x) => x.id === id);
    return r ? this.toProduct(r, true) : null;
  }
}

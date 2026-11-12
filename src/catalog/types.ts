import type { Cents } from "../core/money.js";

/**
 * A product as the rest of the app sees it. `title` and `description` come from third parties
 * and are UNTRUSTED: never put them in a system prompt; use `quoteUntrusted` for the model.
 */
export type Product = {
  id: string;
  title: string;
  description: string;
  merchant: string;
  category: string;
  /** Slugs from the root category down to `category`; missing when the catalog has no hierarchy. */
  categoryPath?: string[];
  priceCents: Cents;
  currency: string;
  attributes: Record<string, string>;
  inStock: boolean;
  url: string;
  /** Main product image (https only), when the catalog has one. */
  imageUrl?: string;
  /** ISO timestamp of when this price was read. */
  priceCheckedAt: string;
  /** True when title/description looks like a prompt injection. Enforced by the guardrails. */
  injectionFlag: boolean;
};

export type SearchOptions = { maxPriceCents?: Cents; limit?: number };

/** A catalog category with its place in the tree. `path` runs from the root to the category itself. */
export type CategoryHit = { slug: string; title: string; path: { slug: string; title: string }[]; hasChildren: boolean };

export interface CatalogGateway {
  readonly name: string;
  search(query: string, opts?: SearchOptions): Promise<Product[]>;
  /** Live read of one product (used at execution time to re-check the price). */
  getProduct(id: string): Promise<Product | null>;
  /** Looks categories up by name, with their tree position, so a person can allow a whole branch. Optional. */
  categories?(query: string, limit?: number): Promise<CategoryHit[]>;
}

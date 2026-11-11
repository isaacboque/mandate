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
  priceCents: Cents;
  currency: string;
  attributes: Record<string, string>;
  inStock: boolean;
  url: string;
  /** ISO timestamp of when this price was read. */
  priceCheckedAt: string;
  /** True when title/description looks like a prompt injection. Enforced by the guardrails. */
  injectionFlag: boolean;
};

export type SearchOptions = { maxPriceCents?: Cents; limit?: number };

export interface CatalogGateway {
  readonly name: string;
  search(query: string, opts?: SearchOptions): Promise<Product[]>;
  /** Live read of one product (used at execution time to re-check the price). */
  getProduct(id: string): Promise<Product | null>;
}

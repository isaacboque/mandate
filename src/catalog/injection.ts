import type { Product } from "./types.js";

const PATTERNS: RegExp[] = [
  /ignore\s+(all\s+|any\s+|your\s+|the\s+)?(previous|prior|above|earlier)?\s*(instructions|rules|guidelines)/i,
  /disregard\s+(all\s+|any\s+|your\s+|the\s+)?(previous|prior|above|earlier)?\s*(instructions|rules|mandate|budget|limits?)/i,
  /(system|developer)\s*(prompt|message)/i,
  /<\/?\s*(system|instructions?|assistant)\s*>/i,
  /pre-?approved/i,
  /(buy|order|purchase|add)\s+(at least\s+)?\d+\s*(x\s*)?(units|pieces|pcs|pairs|items|copies)/i,
  /(raise|increase|change|override|ignore|bypass)\s+(the\s+|your\s+)?(budget|mandate|limit|cap|guardrails?)/i,
  /you\s+(must|should|have to)\s+(now\s+)?(buy|purchase|pay|checkout)/i,
  /(do not|don't)\s+(ask|tell|notify)\s+(the\s+)?(user|buyer|owner|human)/i,
];

export function looksLikeInjection(text: string): boolean {
  return PATTERNS.some((p) => p.test(text));
}

export function productLooksPoisoned(p: { title: string; description: string }): boolean {
  return looksLikeInjection(p.title) || looksLikeInjection(p.description);
}

/**
 * Product text as quoted data for the model: JSON-encoded and clipped, so it can only ever be a
 * string value, never instructions. Pass the result in a user/tool message, not the system prompt.
 */
export function quoteUntrusted(p: Pick<Product, "id" | "title" | "description" | "merchant" | "priceCents" | "currency" | "attributes">): string {
  return JSON.stringify({
    untrusted_product_data: {
      id: p.id,
      title: p.title.slice(0, 200),
      description: p.description.slice(0, 600),
      merchant: p.merchant,
      price_cents: p.priceCents,
      currency: p.currency,
      attributes: p.attributes,
    },
  });
}

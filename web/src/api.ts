export type Autonomy = { mode: "ask_always" } | { mode: "auto_under"; thresholdCents: number };
export type Mandate = {
  currency: string; totalBudgetCents: number; perItemCapCents: number; allowedCategories: string[]; allowedMerchants?: string[];
  maxQuantityPerItem: number; expiresAt: string; autonomy: Autonomy;
};
export type SignedMandate = { mandate: Mandate; hash: string };
export type Config = { demoMode: "mock" | "live"; currency: string; gateway: string; agent: "llm" | "rules"; resettable: boolean; mandate: SignedMandate | null; spentCents: number; seen: { categories: { value: string; count: number }[]; merchants: { value: string; count: number }[] }; now: string };
export type MandatePatch = Partial<{ allowedCategories: string[]; allowedMerchants: string[]; perItemCapCents: number; totalBudgetCents: number }>;
export type NearMiss = {
  productId: string; title: string; merchant: string; category: string; priceCents: number; currency: string; url: string; imageUrl?: string;
  failed: { name: CheckName; reason: string }[];
  fix?: { label: string; patch: MandatePatch };
};

export type CategoryHit = { slug: string; title: string; path: { slug: string; title: string }[]; hasChildren: boolean };
export type CheckName = "total_budget" | "per_item_cap" | "category" | "merchant" | "quantity" | "expiry" | "currency" | "hard_attributes" | "price_freshness" | "injection_flag";
export type Check = { name: CheckName; ok: boolean; reason: string };
export type Order = { id: string; status: string; approveUrl?: string; captureId?: string; amountCents: number; currency: string };
export type ProposalStatus = "blocked" | "pending" | "auto_approved" | "awaiting_buyer" | "paid" | "rejected" | "failed";
export type ProposalLine = { productId: string; title: string; merchant: string; priceCents: number; quantity: number; currency: string; reason: string; url: string; imageUrl?: string };
export type Proposal = {
  id: string; source: "agent" | "attack"; mandateHash: string; ask: string; summary: string; createdAt: string; lines: ProposalLine[];
  totalCents: number; currency: string; checks: Check[]; blocked: boolean; agent?: "llm" | "rules"; status: ProposalStatus; autoApproved: boolean; order?: Order; error?: string;
};
export type AskResult = { proposals: Proposal[]; run: { summary: string; mode: "llm" | "rules"; refused: string[] }; nearMisses: NearMiss[] };
export type TraceEvent = { ts: string; step: string; kind: string; args?: unknown; result?: unknown; error?: string };

async function req<T>(path: string, json?: unknown): Promise<T> {
  const r = await fetch(path, json === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(json) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${r.status}`);
  return data as T;
}

export const api = {
  config: () => req<Config>("/api/config"),
  setMandate: (m: Mandate) => req<SignedMandate>("/api/mandate", m),
  ask: (text: string) => req<AskResult>("/api/ask", { text }),
  approve: (id: string) => req<Proposal>(`/api/proposals/${id}/approve`, {}),
  reject: (id: string) => req<Proposal>(`/api/proposals/${id}/reject`, {}),
  pay: (id: string) => req<Proposal>(`/api/proposals/${id}/pay`, {}),
  proposals: () => fetch("/api/proposals").then((r) => r.json() as Promise<Proposal[]>),
  categories: (q: string) => fetch(`/api/categories?q=${encodeURIComponent(q)}`).then((r) => r.json() as Promise<{ categories: CategoryHit[] }>),
  attack: () => req<Proposal>("/api/attack", {}),
  trace: () => req<TraceEvent[]>("/api/trace"),
  reset: () => req<{ ok: boolean }>("/api/reset", {}),
};

export const money = (cents: number, currency = "EUR") => new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(cents / 100);
export const toCents = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

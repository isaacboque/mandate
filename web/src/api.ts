import { parseMoney } from "./moneyInput";
export type Autonomy = { mode: "ask_always" } | { mode: "auto_under"; thresholdCents: number };
export type Mandate = {
  currency: string; totalBudgetCents: number; perItemCapCents: number; allowedCategories: string[]; allowedMerchants?: string[];
  maxQuantityPerItem: number; expiresAt: string; autonomy: Autonomy; supersedes?: string;
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
export type Draft = { mandate: Mandate; hours: number; understood: string[]; warnings: string[]; mode: "llm" | "rules" };
export type CheckName = "total_budget" | "per_item_cap" | "category" | "merchant" | "quantity" | "expiry" | "currency" | "hard_attributes" | "price_freshness" | "injection_flag" | "mandate_active";
export type Check = { name: CheckName; ok: boolean; reason: string };
export type Order = { id: string; status: string; approveUrl?: string; captureId?: string; amountCents: number; currency: string };
export type ProposalStatus = "blocked" | "pending" | "auto_approved" | "awaiting_buyer" | "paid" | "rejected" | "failed";
export type ProposalLine = { productId: string; title: string; merchant: string; priceCents: number; quantity: number; currency: string; reason: string; url: string; imageUrl?: string };
export type Proposal = {
  id: string; source: "agent" | "attack"; mandateHash: string; ask: string; summary: string; createdAt: string; lines: ProposalLine[];
  totalCents: number; currency: string; checks: Check[]; blocked: boolean; agent?: "llm" | "rules"; status: ProposalStatus; autoApproved: boolean; order?: Order; error?: string;
};
export type AskResult = { proposals: Proposal[]; run: { summary: string; mode: "llm" | "rules"; refused: string[] }; nearMisses: NearMiss[] };
/** One signed contract with the numbers the server computed. Spend counts across the whole amendment chain. */
export type MandateView = {
  hash: string; mandate: Mandate; status: "active" | "revoked" | "superseded" | "expired"; signedAt: string; revokedAt?: string; supersedes?: string;
  spentCents: number; paidCents: number; pendingCents: number; remainingCents: number;
};
export type PendingDraft = { id: string; source: "agent" | "user"; mandate: Mandate; understood: string[]; warnings: string[]; status: "pending" | "signed" | "discarded"; createdAt: string; signedHash?: string };
export type Amendment = { id: string; baseHash: string; mandate: Mandate; diff: { field: string; before: unknown; after: unknown }[]; reason: string; source: "agent" | "user"; status: "pending" | "signed" | "rejected"; createdAt: string; signedHash?: string };
export type BlockedView = { proposalId: string; title: string; status: ProposalStatus; failed: { name: CheckName; reason: string }[]; error?: string; fix?: { label: string; patch: MandatePatch } };
/** What the person sees beside the agent's words. The server builds these from its own state; the UI renders only these four-plus-one shapes. */
export type Card =
  | { type: "draft"; draft: PendingDraft }
  | { type: "amendment"; amendment: Amendment }
  | { type: "proposal"; proposal: Proposal }
  | { type: "spending"; mandates: MandateView[] }
  | { type: "blocked"; blocked: BlockedView };
export type ChatResult = { messages: { role: "assistant"; text: string }[]; cards: unknown[] };
export type TraceEvent = { ts: string; step: string; kind: string; args?: unknown; result?: unknown; error?: string };

async function req<T>(path: string, json?: unknown, post = json !== undefined): Promise<T> {
  const r = await fetch(path, post ? { method: "POST", headers: { "content-type": "application/json" }, ...(json === undefined ? {} : { body: JSON.stringify(json) }) } : undefined);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${r.status}`);
  return data as T;
}

export const api = {
  config: () => req<Config>("/api/config"),
  setMandate: (m: Mandate) => req<SignedMandate>("/api/mandate", m),
  /** The one-click fix: the server signs an amendment (a successor contract), so the chain and the spend are kept. */
  fixMandate: (hash: string, patch: MandatePatch) => req<SignedMandate>(`/api/mandates/${hash}/fix`, { patch }),
  draftMandate: (text: string) => req<Draft>("/api/mandate/draft", { text }),
  ask: (text: string) => req<AskResult>("/api/ask", { text }),
  approve: (id: string) => req<Proposal>(`/api/proposals/${id}/approve`, {}),
  reject: (id: string) => req<Proposal>(`/api/proposals/${id}/reject`, {}),
  pay: (id: string) => req<Proposal>(`/api/proposals/${id}/pay`, {}),
  proposals: () => req<Proposal[]>("/api/proposals"),
  categories: (q: string) => req<{ categories: CategoryHit[] }>(`/api/categories?q=${encodeURIComponent(q)}`),
  attack: () => req<Proposal>("/api/attack", {}),
  trace: () => req<TraceEvent[]>("/api/trace"),
  chat: (text: string) => req<ChatResult>("/api/chat", { text }),
  history: () => req<{ role: "user" | "assistant"; text: string }[]>("/api/chat"),
  mandates: () => req<MandateView[]>("/api/mandates"),
  drafts: () => req<PendingDraft[]>("/api/drafts"),
  amendments: () => req<Amendment[]>("/api/amendments"),
  /** The person signs with the fields as they left them in the form. */
  signDraft: (id: string, m: Mandate) => req<SignedMandate>(`/api/drafts/${id}/sign`, m),
  discardDraft: (id: string) => req<PendingDraft>(`/api/drafts/${id}/discard`, undefined, true),
  /** No body: the server signs exactly the amendment it showed. */
  signAmendment: (id: string) => req<SignedMandate>(`/api/amendments/${id}/sign`, undefined, true),
  rejectAmendment: (id: string) => req<Amendment>(`/api/amendments/${id}/reject`, undefined, true),
  revoke: (hash: string) => req<MandateView>(`/api/mandates/${hash}/revoke`, undefined, true),
  reset: () => req<{ ok: boolean }>("/api/reset", {}),
};

export const money = (cents: number, currency = "EUR") => new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(cents / 100);
/** Forgiving: "90", "90€", "€90", "90 eur", "90,00" all read as 9000 cents (see moneyInput.ts). NaN if it is not an amount. */
export const toCents = parseMoney;

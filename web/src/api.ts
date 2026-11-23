import { newKey, sendWithRetry } from "./idempotent";
import { parseMoney } from "./moneyInput";
export type Autonomy = { mode: "ask_always" } | { mode: "auto_under"; thresholdCents: number };
export type Mandate = {
  currency: string; totalBudgetCents: number; perItemCapCents: number; allowedCategories: string[]; allowedMerchants?: string[];
  maxQuantityPerItem: number; expiresAt: string; autonomy: Autonomy; supersedes?: string;
};
export type SignedMandate = { mandate: Mandate; hash: string };
export type Config = { demoMode: "mock" | "live"; catalog?: "fixtures" | "channel3"; currency: string; gateway: string; agent: "llm" | "rules"; offline?: boolean; llm?: { provider: string; model: string }; resettable: boolean; mandate: SignedMandate | null; spentCents: number; seen: { categories: { value: string; count: number }[]; merchants: { value: string; count: number }[] }; now: string };
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
export type AskResult = { proposals: Proposal[]; run: { summary: string; mode: "llm" | "rules"; refused: string[]; failedClosed?: boolean }; nearMisses: NearMiss[] };
/** One signed contract with the numbers the server computed. Spend counts across the whole amendment chain. */
export type MandateView = {
  hash: string; mandate: Mandate; status: "active" | "revoked" | "superseded" | "expired"; signedAt: string; revokedAt?: string; supersedes?: string;
  spentCents: number; paidCents: number; pendingCents: number; remainingCents: number;
};
export type PendingDraft = { id: string; source: "agent" | "user"; mandate: Mandate; understood: string[]; warnings: string[]; status: "pending" | "signed" | "discarded"; ask?: string; createdAt: string; signedHash?: string };
export type Amendment = { id: string; baseHash: string; mandate: Mandate; diff: { field: string; before: unknown; after: unknown }[]; reason: string; source: "agent" | "user"; status: "pending" | "signed" | "rejected"; createdAt: string; signedHash?: string };
export type BlockedView = { proposalId: string; title: string; status: ProposalStatus; failed: { name: CheckName; reason: string }[]; error?: string; fix?: { label: string; patch: MandatePatch } };
/** What the person sees beside the agent's words. The server builds these from its own state; the UI renders only these six shapes. */
export type Card =
  | { type: "draft"; draft: PendingDraft }
  | { type: "amendment"; amendment: Amendment }
  | { type: "proposal"; proposal: Proposal }
  | { type: "spending"; mandates: MandateView[] }
  | { type: "blocked"; blocked: BlockedView }
  | { type: "error"; message: string }
  | { type: "llm_limited"; variant: "minute" | "day"; retryAfterSec: number; message: string }
  | { type: "note"; message: string };
export type ChatResult = { messages: { role: "assistant"; text: string }[]; cards: unknown[] };
export type TraceEvent = { ts: string; step: string; kind: string; args?: unknown; result?: unknown; error?: string };

async function req<T>(path: string, json?: unknown, post = json !== undefined): Promise<T> {
  const r = post
    ? await sendWithRetry({ url: path, key: newKey(), init: { method: "POST", headers: { "content-type": "application/json" }, ...(json === undefined ? {} : { body: JSON.stringify(json) }) } })
    : await fetch(path);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${r.status}`);
  return data as T;
}

/** What a chat turn is: the person typed something, or the person signed this draft and the agent carries on with what they asked. */
export type ChatInput = string | { afterSign: string };
const chatBody = (i: ChatInput) => (typeof i === "string" ? { text: i } : i);

async function chatStream(input: ChatInput, onText: (delta: string) => void, onStatus?: (text: string) => void): Promise<ChatResult> {
  let r: Response;
  try {
    r = await fetch("/api/chat/stream", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(chatBody(input)) });
  } catch {
    return api.chat(input); // nothing reached the server
  }
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `HTTP ${r.status}`);
  }
  if (!r.body || !(r.headers.get("content-type") ?? "").includes("text/event-stream")) return api.chat(input); // a proxy that cannot stream
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let done: ChatResult | undefined;
  const handle = (block: string) => {
    const event = /^event: (.*)$/m.exec(block)?.[1];
    const data = /^data: (.*)$/m.exec(block)?.[1];
    if (!event || data === undefined) return;
    const payload = JSON.parse(data);
    if (event === "text") onText(String(payload.delta ?? ""));
    else if (event === "status") onStatus?.(String(payload.text ?? ""));
    else if (event === "done") done = payload as ChatResult;
    else if (event === "error") throw new Error(String(payload.error ?? "The agent could not answer"));
  };
  for (;;) {
    const { value, done: end } = await reader.read();
    if (value) buf += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 2); }
    if (end) break;
  }
  if (buf.trim()) handle(buf);
  if (!done) throw new Error("The reply was cut off. Try again.");
  return done;
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
  chat: (input: ChatInput) => req<ChatResult>("/api/chat", chatBody(input)),
  /**
   * The same turn as `chat`, with the agent's words handed to `onText` as they are written (Server-Sent Events). Only the final
   * `done` payload counts: the cards and the reply come from it. If the stream cannot be used at all (no body, wrong content type,
   * network error before anything arrived) it falls back to `chat`; a turn that already ran or failed on the server is never repeated.
   */
  chatStream: (input: ChatInput, onText: (delta: string) => void, onStatus?: (text: string) => void) => chatStream(input, onText, onStatus),
  /** The person's switch between the AI model and the offline rules agent, for this session. */
  setOffline: (offline: boolean) => req<{ agent: "llm" | "rules"; offline: boolean }>("/api/agent/offline", { offline }),
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

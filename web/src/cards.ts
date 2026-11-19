import type { Amendment, Card, MandateView, PendingDraft, Proposal } from "./api";

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown) => typeof x === "string";

/**
 * Cards are the only way the chat can show something actionable, and they come from typed server data, never from the
 * model's words. Anything that is not exactly one of the five known shapes is dropped, so a card type the UI does not know renders nothing.
 */
export function parseCards(raw: unknown): Card[] {
  if (!Array.isArray(raw)) return [];
  const out: Card[] = [];
  for (const c of raw) {
    if (!isObj(c)) continue;
    switch (c.type) {
      case "draft": if (isObj(c.draft) && str(c.draft.id) && isObj(c.draft.mandate)) out.push(c as Card); break;
      case "amendment": if (isObj(c.amendment) && str(c.amendment.id) && Array.isArray(c.amendment.diff)) out.push(c as Card); break;
      case "proposal": if (isObj(c.proposal) && str(c.proposal.id) && Array.isArray(c.proposal.checks)) out.push(c as Card); break;
      case "spending": if (Array.isArray(c.mandates)) out.push(c as Card); break;
      case "blocked": if (isObj(c.blocked) && Array.isArray(c.blocked.failed)) out.push(c as Card); break;
      default: break; // unknown type: nothing is rendered
    }
  }
  return out;
}

/** What needs the person right now. Drives the dot on each mobile tab. */
export function attention(drafts: PendingDraft[], amendments: Amendment[], proposals: Proposal[]): { chat: boolean; contracts: boolean } {
  return {
    contracts: drafts.some((d) => d.status === "pending") || amendments.some((a) => a.status === "pending"),
    chat: proposals.some((p) => !p.blocked && (p.status === "pending" || p.status === "awaiting_buyer" || p.status === "auto_approved")),
  };
}

/** Contracts that can still spend: shown first. */
export function sortContracts(list: MandateView[]): MandateView[] {
  const rank = { active: 0, expired: 1, superseded: 2, revoked: 3 } as const;
  return list.slice().sort((a, b) => rank[a.status] - rank[b.status] || Date.parse(b.signedAt) - Date.parse(a.signedAt));
}

/** "2 days 3 h left", "45 min left", "expired". Pure: the caller passes the clock. */
export function countdown(expiresAt: string, nowMs: number): string {
  const ms = Date.parse(expiresAt) - nowMs;
  if (!(ms > 0)) return "expired";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "less than a minute left";
  if (min < 60) return `${min} min left`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ${min % 60 ? `${min % 60} min ` : ""}left`;
  return `${Math.floor(h / 24)} days ${h % 24} h left`;
}

/** Meter segments as whole percentages of the budget: spent, waiting for approval, remaining. */
export function meter(v: Pick<MandateView, "spentCents" | "pendingCents" | "remainingCents"> & { mandate: { totalBudgetCents: number } }): { spent: number; pending: number; remaining: number } {
  const total = v.mandate.totalBudgetCents || 1;
  const spent = Math.min(100, Math.round((v.spentCents / total) * 100));
  const pending = Math.min(100 - spent, Math.round((v.pendingCents / total) * 100));
  return { spent, pending, remaining: Math.max(0, 100 - spent - pending) };
}

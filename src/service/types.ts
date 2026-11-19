import type { Cents } from "../core/money.js";
import type { Cart, CheckResult, Mandate, MandateStatus } from "../mandate/types.js";
import type { Order } from "../payments/types.js";

export type ProposalStatus = "blocked" | "pending" | "auto_approved" | "awaiting_buyer" | "paid" | "rejected" | "failed";

export type ProposalLine = {
  productId: string;
  title: string;
  merchant: string;
  priceCents: Cents;
  quantity: number;
  currency: string;
  /** Why the agent picked it. Free text from the agent: display only. */
  reason: string;
  url: string;
  imageUrl?: string;
};

export type Proposal = {
  id: string;
  source: "agent" | "attack";
  mandateHash: string;
  ask: string;
  summary: string;
  createdAt: string;
  lines: ProposalLine[];
  cart: Cart;
  totalCents: Cents;
  currency: string;
  checks: CheckResult[];
  blocked: boolean;
  /** Which agent picked this cart. */
  agent?: "llm" | "rules";
  status: ProposalStatus;
  autoApproved: boolean;
  approvalId?: string;
  order?: Order;
  error?: string;
};

export type ProposeInput = {
  lines: { productId: string; quantity: number; reason: string }[];
  requiredAttributes?: Record<string, string>;
  summary?: string;
};

/** Fields of a mandate that a person can change to let a product through. The agent can never do this. */
export type MandatePatch = Partial<{ allowedCategories: string[]; allowedMerchants: string[]; perItemCapCents: number; totalBudgetCents: number }>;

/** A product the agent found but could not propose, and why. */
export type NearMiss = {
  productId: string; title: string; merchant: string; category: string; priceCents: number; currency: string; url: string; imageUrl?: string;
  failed: { name: string; reason: string }[];
  /** Present only when every failure is a limit the person could raise or widen. */
  fix?: { label: string; patch: MandatePatch };
};

/** One signed contract with its own numbers, computed by the server. Spend counts across the whole amendment chain. */
export type MandateView = {
  hash: string; mandate: Mandate; status: MandateStatus | "expired"; signedAt: string; revokedAt?: string; supersedes?: string;
  /** Approved or paid, here and under every contract this one replaced. */
  spentCents: Cents;
  paidCents: Cents;
  /** Proposed under this contract and waiting for a person. Not counted as spent yet. */
  pendingCents: Cents;
  remainingCents: Cents;
};

/** A contract the agent (or a person) drafted. It is not a mandate: nothing can be spent under it until a person signs it. */
export type PendingDraft = {
  id: string; source: "agent" | "user"; mandate: Mandate; understood: string[]; warnings: string[];
  status: "pending" | "signed" | "discarded"; createdAt: string; signedHash?: string;
};

export type AmendmentChanges = Partial<Pick<Mandate, "totalBudgetCents" | "perItemCapCents" | "allowedCategories" | "allowedMerchants" | "maxQuantityPerItem" | "expiresAt" | "autonomy">>;

/** A proposed change to a signed contract. It only counts once a person signs it, which creates a successor contract. */
export type Amendment = {
  id: string; baseHash: string; mandate: Mandate; diff: { field: string; before: unknown; after: unknown }[]; reason: string;
  source: "agent" | "user"; status: "pending" | "signed" | "rejected"; createdAt: string; signedHash?: string;
};

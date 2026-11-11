import type { Cents } from "../core/money.js";
import type { Cart, CheckResult } from "../mandate/types.js";
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

import type { Cents } from "../core/money.js";

export type OrderStatus = "awaiting_buyer" | "approved" | "completed" | "failed";

export type OrderLine = { name: string; quantity: number; unitPriceCents: Cents };

export type Order = {
  id: string;
  mandateHash: string;
  lines: OrderLine[];
  amountCents: Cents;
  currency: string;
  idempotencyKey: string;
  status: OrderStatus;
  createdAt: string;
  /** Where the buyer approves the payment (PayPal sandbox page, or mock://). */
  approveUrl?: string;
  captureId?: string;
};

export type CreateOrderInput = {
  mandateHash: string;
  lines: OrderLine[];
  currency: string;
  idempotencyKey: string;
  approvalId: string;
};

/**
 * What the gateways need from the approval queue (M5 implements it).
 * `assertExecutable` throws unless the approval is granted and not yet used.
 * `markExecuted` consumes it.
 */
export interface ApprovalGuard {
  assertExecutable(approvalId: string, op: "create_order" | "capture_order"): void;
  markExecuted(approvalId: string, result: unknown): void;
}

/**
 * Every method that moves money needs an approved approvalId. Creating an order only asserts the
 * approval; capturing (the actual payment) asserts and consumes it.
 * Re-checking the mandate and live price at execution time is the caller's job (M5), before these.
 */
export interface PaymentGateway {
  readonly name: string;
  createOrder(input: CreateOrderInput): Promise<Order>;
  getOrder(id: string): Promise<Order>;
  captureOrder(id: string, approvalId: string): Promise<Order>;
  list(): Promise<Order[]>;
}

export const orderTotal = (lines: OrderLine[]): Cents => lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);

export function orderIdempotencyKey(mandateHash: string, lines: OrderLine[], currency: string): string {
  return `${mandateHash}:${currency}:${lines.map((l) => `${l.name}x${l.quantity}@${l.unitPriceCents}`).join(",")}`;
}

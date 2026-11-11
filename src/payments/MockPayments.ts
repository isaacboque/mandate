import { assertCents } from "../core/money.js";
import type { Tracer } from "../trace/trace.js";
import { orderTotal, type ApprovalGuard, type CreateOrderInput, type Order, type PaymentGateway } from "./types.js";

/** Same rules as the PayPal gateway, no network. The "buyer" approves by calling `simulateBuyerApproval`. */
export class MockPayments implements PaymentGateway {
  readonly name = "mock";
  private orders = new Map<string, Order>();
  private n = 0;

  constructor(
    private approvals: ApprovalGuard,
    private tracer?: Tracer,
    private opts: { now?: () => Date; traceId?: string } = {},
  ) {}

  private trace(step: string, kind: "tool" | "error", extra: object) {
    this.tracer?.log({ runId: this.opts.traceId ?? "payments", step, kind, ...extra });
  }
  private now() {
    return (this.opts.now ?? (() => new Date()))().toISOString();
  }

  async createOrder(input: CreateOrderInput): Promise<Order> {
    const dup = [...this.orders.values()].find((o) => o.idempotencyKey === input.idempotencyKey);
    if (dup) {
      this.trace("payments.create.duplicate", "tool", { args: input, result: { id: dup.id } });
      return dup;
    }
    this.guard("create_order", input.approvalId);
    for (const l of input.lines) assertCents(l.unitPriceCents);
    const id = `MOCK-ORDER-${++this.n}`;
    const order: Order = {
      id, mandateHash: input.mandateHash, lines: input.lines, amountCents: orderTotal(input.lines), currency: input.currency,
      idempotencyKey: input.idempotencyKey, status: "awaiting_buyer", createdAt: this.now(), approveUrl: `mock://approve/${id}`,
    };
    this.orders.set(id, order);
    this.trace("payments.create", "tool", { args: input, result: { id } });
    return order;
  }

  /** Test/demo helper: the buyer clicked "approve" on the PayPal page. */
  simulateBuyerApproval(id: string): Order {
    const o = this.get(id);
    if (o.status === "awaiting_buyer") o.status = "approved";
    return o;
  }

  async getOrder(id: string): Promise<Order> {
    return this.get(id);
  }

  async captureOrder(id: string, approvalId: string): Promise<Order> {
    const o = this.get(id);
    if (o.status === "completed") {
      this.trace("payments.capture.duplicate", "tool", { args: { id }, result: { captureId: o.captureId } });
      return o;
    }
    this.guard("capture_order", approvalId);
    if (o.status !== "approved") {
      const msg = `Cannot capture order ${id}: buyer has not approved it (status ${o.status})`;
      this.trace("payments.capture.refused", "error", { error: msg });
      throw new Error(msg);
    }
    o.status = "completed";
    o.captureId = `MOCK-CAPTURE-${id}`;
    this.approvals.markExecuted(approvalId, { orderId: id, captureId: o.captureId });
    this.trace("payments.capture", "tool", { args: { id }, result: { captureId: o.captureId } });
    return o;
  }

  async list(): Promise<Order[]> {
    return [...this.orders.values()];
  }

  private get(id: string): Order {
    const o = this.orders.get(id);
    if (!o) throw new Error(`Unknown order ${id}`);
    return o;
  }
  private guard(op: "create_order" | "capture_order", approvalId: string) {
    try {
      this.approvals.assertExecutable(approvalId, op);
    } catch (e) {
      this.trace(`payments.${op}.refused`, "error", { error: (e as Error).message });
      throw e;
    }
  }
}

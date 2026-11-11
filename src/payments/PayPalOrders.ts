import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Tracer } from "../trace/trace.js";
import { orderTotal, type ApprovalGuard, type CreateOrderInput, type Order, type OrderStatus, type PaymentGateway } from "./types.js";

/** Calls one PayPal order tool (create_order | get_order | pay_order) by name. Injected so tests never touch the network. */
export interface ToolInvoker {
  call(tool: string, params: Record<string, unknown>): Promise<unknown>;
}

export function parseMaybeJson(x: unknown): unknown {
  if (typeof x !== "string") return x;
  try {
    return JSON.parse(x);
  } catch {
    return x;
  }
}

type PayPalOrder = {
  id?: string;
  status?: string;
  links?: { href: string; rel: string }[];
  purchase_units?: { payments?: { captures?: { id?: string; status?: string }[] } }[];
};

export function mapOrderStatus(paypal: string | undefined, fallback: OrderStatus): OrderStatus {
  switch (paypal) {
    case "COMPLETED":
      return "completed";
    case "APPROVED":
      return "approved";
    case "CREATED":
    case "PAYER_ACTION_REQUIRED":
    case "SAVED":
      return "awaiting_buyer";
    case "VOIDED":
      return "failed";
    default:
      return fallback;
  }
}

export function extractApproveUrl(o: PayPalOrder): string | undefined {
  return (o.links?.find((l) => l.rel === "payer-action") ?? o.links?.find((l) => l.rel === "approve"))?.href;
}
const captureIdOf = (o: PayPalOrder) => o.purchase_units?.[0]?.payments?.captures?.[0]?.id;

/**
 * PaymentGateway on the PayPal sandbox: create the order, hand back the buyer's approve link,
 * capture once the buyer approved. Same approval and idempotency rules as MockPayments.
 * Orders are cached in `opts.file` so idempotency survives a restart.
 */
export class PayPalOrders implements PaymentGateway {
  readonly name = "paypal-sandbox";
  private orders = new Map<string, Order>();

  constructor(
    private tools: ToolInvoker,
    private approvals: ApprovalGuard,
    private tracer?: Tracer,
    private opts: { file?: string; now?: () => Date; returnUrl?: string; cancelUrl?: string; traceId?: string } = {},
  ) {
    if (opts.file && existsSync(opts.file)) for (const o of JSON.parse(readFileSync(opts.file, "utf8")) as Order[]) this.orders.set(o.id, o);
  }

  async createOrder(input: CreateOrderInput): Promise<Order> {
    const dup = [...this.orders.values()].find((o) => o.idempotencyKey === input.idempotencyKey);
    if (dup) {
      this.trace("paypal.create_order.duplicate", "tool", { args: input, result: { id: dup.id } });
      return dup;
    }
    this.guard("create_order", input.approvalId);

    const major = (c: number) => Number((c / 100).toFixed(2));
    const params = {
      currencyCode: input.currency,
      requestId: input.idempotencyKey.slice(0, 100),
      items: input.lines.map((l) => ({
        name: l.name.slice(0, 120),
        quantity: l.quantity,
        itemCost: major(l.unitPriceCents),
        itemTotal: major(l.unitPriceCents * l.quantity),
      })),
      notes: `Mandate ${input.mandateHash}`,
      returnUrl: this.opts.returnUrl ?? "http://localhost:5173/?paypal=return",
      cancelUrl: this.opts.cancelUrl ?? "http://localhost:5173/?paypal=cancel",
    };
    const created = (await this.call("create_order", params)) as PayPalOrder;
    if (!created?.id) throw new Error(`PayPal create_order returned no order id: ${JSON.stringify(created).slice(0, 300)}`);
    const order: Order = {
      id: created.id, mandateHash: input.mandateHash, lines: input.lines, amountCents: orderTotal(input.lines), currency: input.currency,
      idempotencyKey: input.idempotencyKey, status: mapOrderStatus(created.status, "awaiting_buyer"), createdAt: this.now(),
      approveUrl: extractApproveUrl(created),
    };
    this.orders.set(order.id, order);
    this.persist();
    return order;
  }

  async getOrder(id: string): Promise<Order> {
    const o = this.get(id);
    const remote = (await this.call("get_order", { id })) as PayPalOrder;
    o.status = mapOrderStatus(remote?.status, o.status);
    o.captureId = captureIdOf(remote) ?? o.captureId;
    this.persist();
    return o;
  }

  async captureOrder(id: string, approvalId: string): Promise<Order> {
    const current = await this.getOrder(id);
    if (current.status === "completed") {
      this.trace("paypal.pay_order.duplicate", "tool", { args: { id }, result: { captureId: current.captureId } });
      return current;
    }
    this.guard("capture_order", approvalId);
    if (current.status !== "approved") {
      const msg = `Cannot capture order ${id}: buyer has not approved it (status ${current.status})`;
      this.trace("paypal.pay_order.refused", "error", { error: msg });
      throw new Error(msg);
    }
    const paid = (await this.call("pay_order", { id })) as PayPalOrder;
    current.status = mapOrderStatus(paid?.status, current.status);
    current.captureId = captureIdOf(paid) ?? current.captureId;
    this.persist();
    if (current.status !== "completed") throw new Error(`PayPal did not complete order ${id} (status ${paid?.status ?? "unknown"})`);
    this.approvals.markExecuted(approvalId, { orderId: id, captureId: current.captureId });
    return current;
  }

  async list(): Promise<Order[]> {
    return [...this.orders.values()];
  }

  private async call(tool: string, params: Record<string, unknown>): Promise<unknown> {
    const started = Date.now();
    try {
      const result = parseMaybeJson(await this.tools.call(tool, params));
      this.trace(`paypal.${tool}`, "tool", { args: params, result: { result, ms: Date.now() - started } });
      return result;
    } catch (e) {
      this.trace(`paypal.${tool}`, "error", { args: params, error: (e as Error).message });
      throw e;
    }
  }
  private trace(step: string, kind: "tool" | "error", extra: object) {
    this.tracer?.log({ runId: this.opts.traceId ?? "payments", step, kind, ...extra });
  }
  private get(id: string): Order {
    const o = this.orders.get(id);
    if (!o) throw new Error(`Unknown order ${id}`);
    return o;
  }
  private now() {
    return (this.opts.now ?? (() => new Date()))().toISOString();
  }
  private persist() {
    if (!this.opts.file) return;
    mkdirSync(dirname(this.opts.file), { recursive: true });
    writeFileSync(this.opts.file, JSON.stringify([...this.orders.values()], null, 2));
  }
  private guard(op: "create_order" | "capture_order", approvalId: string) {
    try {
      this.approvals.assertExecutable(approvalId, op);
    } catch (e) {
      this.trace(`paypal.${op}.refused`, "error", { error: (e as Error).message });
      throw e;
    }
  }
}

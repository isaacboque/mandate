import type { Cents } from "../core/money.js";
import type { Tracer } from "../trace/trace.js";
import type { ApprovalGuard } from "../payments/types.js";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "executed";
export type Approval = {
  id: string;
  proposalId: string;
  amountCents: Cents;
  status: ApprovalStatus;
  /** True when the mandate's autonomy rule approved it, not a person. */
  autoApproved: boolean;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  note?: string;
  executedAt?: string;
  result?: unknown;
};

export class ApprovalRequiredError extends Error {}

/** Human approval queue. Gateways call `assertExecutable` before moving money. */
export class ApprovalQueue implements ApprovalGuard {
  private items = new Map<string, Approval>();
  private seq = 0;
  constructor(
    private tracer: Tracer,
    private runId: string,
    private now: () => Date = () => new Date(),
  ) {}

  propose(proposalId: string, amountCents: Cents): Approval {
    const a: Approval = { id: `apr_${++this.seq}`, proposalId, amountCents, status: "pending", autoApproved: false, createdAt: this.now().toISOString() };
    this.items.set(a.id, a);
    this.tracer.log({ runId: this.runId, step: "approval.proposed", kind: "approval", args: { proposalId, amountCents }, result: { id: a.id } });
    return a;
  }

  decide(id: string, approve: boolean, by = "user", note?: string, auto = false): Approval {
    const a = this.get(id);
    if (a.status !== "pending") throw new Error(`Approval ${id} is already ${a.status}`);
    a.status = approve ? "approved" : "rejected";
    a.autoApproved = auto;
    a.decidedAt = this.now().toISOString();
    a.decidedBy = by;
    a.note = note;
    this.tracer.log({ runId: this.runId, step: approve ? (auto ? "approval.auto_approved" : "approval.approved") : "approval.rejected", kind: "approval", args: { id, by, note } });
    return a;
  }

  assertExecutable(id: string, op: "create_order" | "capture_order"): void {
    if (!id) throw new ApprovalRequiredError("No approval id given");
    const a = this.items.get(id);
    if (!a) throw new ApprovalRequiredError(`Unknown approval ${id}`);
    // create_order may run while approved; capture_order consumes the approval (executed = used up).
    if (a.status !== "approved") throw new ApprovalRequiredError(`Approval ${id} is ${a.status}; ${op} refused`);
  }

  markExecuted(id: string, result: unknown): void {
    const a = this.get(id);
    a.status = "executed";
    a.executedAt = this.now().toISOString();
    a.result = result;
    this.tracer.log({ runId: this.runId, step: "approval.executed", kind: "approval", args: { id }, result });
  }

  get(id: string): Approval {
    const a = this.items.get(id);
    if (!a) throw new Error(`Unknown approval ${id}`);
    return a;
  }
  list(status?: ApprovalStatus): Approval[] {
    return [...this.items.values()].filter((a) => !status || a.status === status);
  }
  clear(): void {
    this.items.clear();
  }
}

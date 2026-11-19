import { describe, expect, it } from "vitest";
import { ApprovalQueue } from "../src/approval/queue.js";
import { FixtureCatalog } from "../src/catalog/FixtureCatalog.js";
import type { Draft } from "../src/mandate/draft.js";
import type { Mandate } from "../src/mandate/types.js";
import { MockPayments } from "../src/payments/MockPayments.js";
import { MandateService } from "../src/service/service.js";
import { MemoryTracer } from "../src/trace/trace.js";

const shoes: Mandate = {
  currency: "EUR", totalBudgetCents: 10000, perItemCapCents: 10000, allowedCategories: ["shoes"], maxQuantityPerItem: 1,
  expiresAt: "2026-11-12T18:00:00Z", autonomy: { mode: "ask_always" },
};
const socks: Mandate = { ...shoes, totalBudgetCents: 2000, perItemCapCents: 2000, allowedCategories: ["socks"] };

function world() {
  let t = new Date("2026-11-12T10:00:00Z").getTime();
  const now = () => new Date(t);
  const tracer = new MemoryTracer(now);
  const approvals = new ApprovalQueue(tracer, "run", now);
  const payments = new MockPayments(approvals, tracer, { now, traceId: "run" });
  const service = new MandateService({ catalog: new FixtureCatalog({ now }), attackCatalog: new FixtureCatalog({ now }), payments, approvals, tracer, runId: "run", now });
  const catalog = new FixtureCatalog({ now });
  return { service, payments, catalog, advance: (ms: number) => (t += ms) };
}
const buy = async (service: MandateService, text: string, hash?: string) => (await service.ask(text, hash)).proposals[0];
const draftOf = (m: Mandate): Draft => ({ mandate: m, hours: 8, understood: ["x"], warnings: [], mode: "rules" });

describe("several contracts at once", () => {
  it("keeps every signed contract active and lists each one with its own numbers", () => {
    const { service } = world();
    const a = service.addMandate(shoes);
    const b = service.addMandate(socks);
    expect(service.mandates().map((m) => [m.hash, m.status, m.remainingCents])).toEqual([[a.hash, "active", 10000], [b.hash, "active", 2000]]);
    expect(service.mandate?.hash).toBe(b.hash); // the single-contract screens work with the newest active one
  });
  it("a cart proposed under contract B is judged by B only, and never spends A", async () => {
    const { service, catalog } = world();
    const a = service.addMandate(shoes);
    const b = service.addMandate(socks);
    const shoe = (await catalog.getProduct("shoe-court-1"))!; // fits A (shoes, 100 €), not B (socks, 20 €)
    const underB = service.createProposal("agent", "x", new Map([[shoe.id, shoe]]), { lines: [{ productId: shoe.id, quantity: 1, reason: "x" }] }, "", b.hash);
    expect(underB.blocked).toBe(true);
    expect(underB.checks.filter((c) => !c.ok).map((c) => c.name)).toEqual(["total_budget", "per_item_cap", "category"]);
    const ok = await buy(service, "Grip socks, max 15 €", b.hash);
    expect(ok).toMatchObject({ mandateHash: b.hash, blocked: false });
    await service.approve(ok.id);
    expect(service.mandates().find((m) => m.hash === a.hash)?.remainingCents).toBe(10000);
    expect(service.mandates().find((m) => m.hash === b.hash)?.remainingCents).toBe(800);
  });
  it("refuses a contract that does not exist", async () => {
    const { service } = world();
    service.addMandate(shoes);
    await expect(service.ask("shoes", "000000000000")).rejects.toThrow(/Unknown mandate/);
  });
  it("setMandate (the one-form screen) still replaces: earlier contracts and their proposals stop working", async () => {
    const { service } = world();
    const a = service.addMandate(shoes);
    const p = await buy(service, "Indoor futsal shoes, max 90 €");
    service.setMandate({ ...shoes, totalBudgetCents: 20000 });
    expect(service.mandates().find((m) => m.hash === a.hash)?.status).toBe("superseded");
    expect((await service.approve(p.id)).status).toBe("failed");
  });
});

describe("revoke", () => {
  it("a contract revoked after approval and before payment stops the payment", async () => {
    const { service, payments } = world();
    const m = service.addMandate(shoes);
    const p = await buy(service, "Indoor futsal shoes, max 90 €");
    await service.approve(p.id);
    service.revoke(m.hash);
    await expect(service.pay(p.id)).rejects.toThrow(/revoked/);
    expect(service.get(p.id).status).toBe("failed");
    expect(await payments.list()).toHaveLength(1); // the order exists, nothing was captured
    expect((await payments.list())[0].status).not.toBe("completed");
  });
  it("a proposal under a revoked contract is blocked by mandate_active at proposal time", async () => {
    const { service } = world();
    const m = service.addMandate(shoes);
    service.revoke(m.hash);
    const p = await buy(service, "Indoor futsal shoes, max 90 €", m.hash);
    expect(p.blocked).toBe(true);
    expect(p.checks.filter((c) => !c.ok).map((c) => c.name)).toEqual(["mandate_active"]);
  });
  it("cannot be revoked twice, and an unknown hash is an error", () => {
    const { service } = world();
    const m = service.addMandate(shoes);
    service.revoke(m.hash);
    expect(() => service.revoke(m.hash)).toThrow(/already revoked/);
    expect(() => service.revoke("000000000000")).toThrow(/Unknown mandate/);
  });
});

describe("drafts are pending until a person signs", () => {
  it("a draft is not a mandate: nothing is spendable and the signed list is unchanged", () => {
    const { service } = world();
    const d = service.createDraft(draftOf({ ...shoes, totalBudgetCents: 99_000_000 }), "agent");
    expect(d).toMatchObject({ status: "pending", source: "agent" });
    expect(service.mandates()).toEqual([]);
    expect(service.mandate).toBeNull();
  });
  it("signing uses the fields as the person left them, validated like a hand-typed mandate", () => {
    const { service } = world();
    const d = service.createDraft(draftOf({ ...shoes, totalBudgetCents: 99_000_000 }), "agent");
    const signed = service.signDraft(d.id, { ...shoes, totalBudgetCents: 5000 });
    expect(signed.mandate.totalBudgetCents).toBe(5000);
    expect(service.drafts()[0].status).toBe("signed");
    expect(() => service.signDraft(d.id)).toThrow(/signed/);
    const bad = service.createDraft(draftOf(shoes), "agent");
    expect(() => service.signDraft(bad.id, { ...shoes, totalBudgetCents: -5 })).toThrow();
    expect(() => service.signDraft(bad.id, { ...shoes, allowedCategories: [] })).toThrow();
  });
});

describe("amendments are successor contracts", () => {
  it("a proposed amendment changes nothing until a person signs it", () => {
    const { service } = world();
    const a = service.addMandate(shoes);
    const am = service.amend(a.hash, { totalBudgetCents: 50000 }, "need more", "agent");
    expect(am).toMatchObject({ status: "pending", baseHash: a.hash, source: "agent" });
    expect(am.diff).toEqual([{ field: "totalBudgetCents", before: 10000, after: 50000 }]);
    expect(service.mandates()).toHaveLength(1);
    expect(service.mandates()[0]).toMatchObject({ hash: a.hash, status: "active", remainingCents: 10000 });
  });
  it("signing creates a new hash that supersedes the old one, which can no longer be used", async () => {
    const { service } = world();
    const a = service.addMandate(shoes);
    const pending = await buy(service, "Indoor futsal shoes, max 90 €");
    const next = service.signAmendment(service.amend(a.hash, { totalBudgetCents: 20000 }, "more", "agent").id);
    expect(next.hash).not.toBe(a.hash);
    expect(next.mandate.supersedes).toBe(a.hash);
    expect(service.mandates().map((m) => m.status)).toEqual(["superseded", "active"]);
    await expect(service.approve(pending.id).then((p) => p.status)).resolves.toBe("failed");
    const stale = await buy(service, "Indoor futsal shoes, max 90 €", a.hash);
    expect(stale.checks.find((c) => c.name === "mandate_active")?.ok).toBe(false);
  });
  it("cannot reset spend: budget 100, spent 79, successor 200 leaves 121, not 200", async () => {
    const { service, catalog } = world();
    const a = service.addMandate(shoes);
    const first = await buy(service, "Indoor futsal shoes, size 43, max 90 €");
    await service.approve(first.id); // 79 € committed
    const next = service.signAmendment(service.amend(a.hash, { totalBudgetCents: 20000, perItemCapCents: 20000 }, "more", "agent").id);
    expect(service.mandates().find((m) => m.hash === next.hash)).toMatchObject({ spentCents: 7900, remainingCents: 12100 });
    const pricey = (await catalog.getProduct("shoe-court-4"))!; // 135 €: fits a fresh 200 € budget, not the 121 € that is left
    const big = service.createProposal("agent", "x", new Map([[pricey.id, pricey]]), { lines: [{ productId: pricey.id, quantity: 1, reason: "x" }] }, "", next.hash);
    expect(big.checks.filter((c) => !c.ok).map((c) => c.name)).toEqual(["total_budget"]);
  });
  it("is refused at proposal time when the new budget is below what the chain already spent", async () => {
    const { service } = world();
    const a = service.addMandate(shoes);
    await service.approve((await buy(service, "Indoor futsal shoes, size 43, max 90 €")).id);
    expect(() => service.amend(a.hash, { totalBudgetCents: 5000 }, "less", "agent")).toThrow(/below|already/);
  });
  it("rejects an amendment that changes nothing, and one built on a contract that is not active", () => {
    const { service } = world();
    const a = service.addMandate(shoes);
    expect(() => service.amend(a.hash, { totalBudgetCents: 10000 }, "same", "agent")).toThrow(/nothing/i);
    service.revoke(a.hash);
    expect(() => service.amend(a.hash, { totalBudgetCents: 20000 }, "x", "agent")).toThrow(/revoked/);
  });
  it("can be rejected by the person, and then cannot be signed", () => {
    const { service } = world();
    const a = service.addMandate(shoes);
    const am = service.amend(a.hash, { totalBudgetCents: 20000 }, "x", "agent");
    service.rejectAmendment(am.id);
    expect(() => service.signAmendment(am.id)).toThrow(/rejected/);
    expect(service.mandates()).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";
import { ApprovalQueue } from "../src/approval/queue.js";
import { FixtureCatalog } from "../src/catalog/FixtureCatalog.js";
import type { Mandate } from "../src/mandate/types.js";
import { MockPayments } from "../src/payments/MockPayments.js";
import { createApp } from "../src/server/app.js";
import { MandateService } from "../src/service/service.js";
import { MemoryTracer } from "../src/trace/trace.js";

const ASK = "Indoor futsal shoes, size 43, non-marking sole, max 90 €";
const base: Mandate = {
  currency: "EUR", totalBudgetCents: 9000, perItemCapCents: 9000, allowedCategories: ["shoes"], maxQuantityPerItem: 1,
  expiresAt: "2026-11-12T18:00:00Z", autonomy: { mode: "ask_always" },
};

function setup() {
  const now = () => new Date("2026-11-12T10:00:00Z");
  const tracer = new MemoryTracer(now);
  const approvals = new ApprovalQueue(tracer, "run", now);
  const payments = new MockPayments(approvals, tracer, { now, traceId: "run" });
  const service = new MandateService({ catalog: new FixtureCatalog({ now }), attackCatalog: new FixtureCatalog({ now }), payments, approvals, tracer, runId: "run", now });
  service.setMandate(base);
  const app = createApp(service, { demoMode: "mock", currency: "EUR" });
  return { service, app };
}

describe("the one-click fix is a signed amendment, not a new chain (tickets 19, 23)", () => {
  it("creates a successor that supersedes the old contract and keeps the spend", async () => {
    const { service } = setup();
    const first = service.mandate!;
    const p = (await service.ask(ASK)).proposals[0];
    await service.approve(p.id);
    await service.pay(p.id);
    const before = service.spentCents(first.hash);
    expect(before).toBeGreaterThan(0);

    const next = service.applyFix(first.hash, { totalBudgetCents: 20000, perItemCapCents: 20000 });
    expect(next.mandate.supersedes).toBe(first.hash);
    const views = service.mandates();
    expect(views.find((v) => v.hash === first.hash)?.status).toBe("superseded");
    const nv = views.find((v) => v.hash === next.hash)!;
    expect(nv.status).toBe("active");
    expect(nv.spentCents).toBe(before); // not reset
    expect(nv.remainingCents).toBe(20000 - before);
    expect(service.amendments().at(-1)).toMatchObject({ source: "user", status: "signed", signedHash: next.hash });
  });

  it("cannot be used to fix a contract that is revoked or already replaced", () => {
    const { service } = setup();
    const first = service.mandate!;
    const next = service.applyFix(first.hash, { totalBudgetCents: 20000 });
    expect(() => service.applyFix(first.hash, { totalBudgetCents: 30000 })).toThrow(/superseded/);
    service.revoke(next.hash);
    expect(() => service.applyFix(next.hash, { totalBudgetCents: 30000 })).toThrow(/revoked/);
  });

  it("refuses a fix that lowers the budget below what the chain spent, or changes nothing", async () => {
    const { service } = setup();
    const first = service.mandate!;
    const p = (await service.ask(ASK)).proposals[0];
    await service.approve(p.id);
    expect(() => service.applyFix(first.hash, { totalBudgetCents: 100 })).toThrow(/below|already/);
    expect(() => service.applyFix(first.hash, { totalBudgetCents: 9000 })).toThrow(/nothing/i);
  });

  it("over HTTP: POST /api/mandates/:hash/fix signs the successor; an unknown hash or bad body is a plain 400", async () => {
    const { service, app } = setup();
    const first = service.mandate!;
    const post = (path: string, body: unknown) => app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const ok = await post(`/api/mandates/${first.hash}/fix`, { patch: { allowedCategories: ["shoes", "socks"] } });
    expect(ok.status).toBe(201);
    expect(((await ok.json()) as { mandate: Mandate }).mandate.supersedes).toBe(first.hash);
    expect((await post("/api/mandates/nope/fix", { patch: { totalBudgetCents: 1 } })).status).toBe(400);
    expect((await post(`/api/mandates/${first.hash}/fix`, { patch: { currency: "USD" } })).status).toBe(400); // only the four fix fields
  });
});

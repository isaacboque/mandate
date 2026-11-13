import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { ApprovalQueue } from "../src/approval/queue.js";
import { FixtureCatalog } from "../src/catalog/FixtureCatalog.js";
import { draftMandate } from "../src/mandate/draft.js";
import { MockPayments } from "../src/payments/MockPayments.js";
import { createApp } from "../src/server/app.js";
import { RateLimiter } from "../src/server/limits.js";
import { MandateService } from "../src/service/service.js";
import { MemoryTracer } from "../src/trace/trace.js";
import { scriptedModel } from "./helpers/mockModel.js";

const NOW = new Date("2026-11-12T10:00:00Z");
const catalog = new FixtureCatalog({ now: () => NOW });
const spec = (over: Record<string, unknown> = {}) => ({ totalBudget: 100, categories: ["shoes"], autonomy: { mode: "ask_always" }, ...over });
const modelFor = (input: unknown) => scriptedModel([{ tools: [{ name: "draft_mandate", input }] }, { text: "done" }]);
const draft = (text: string, input?: unknown) => draftMandate({ text, currency: "EUR", model: input ? modelFor(input) : undefined, catalog, now: NOW });

describe("drafting a mandate from plain words (AI model)", () => {
  it("turns the model's reading into a mandate with real catalog categories, and says it in plain words", async () => {
    const d = await draft("One pair of shoes, up to 100", spec());
    expect(d.mode).toBe("llm");
    expect(d.mandate).toMatchObject({ currency: "EUR", totalBudgetCents: 10000, perItemCapCents: 10000, allowedCategories: ["shoes"], maxQuantityPerItem: 1, autonomy: { mode: "ask_always" } });
    expect(d.mandate.expiresAt).toBe("2026-11-13T10:00:00.000Z");
    expect(d.hours).toBe(24);
    expect(d.understood).toEqual(expect.arrayContaining(["Total budget 100.00 EUR", "Valid for 1 day", "It asks you before every purchase"]));
    expect(d.understood.join(" ")).toContain("Shoes");
    expect(d.warnings).toEqual([]);
  });
  it("reads shops, quantity, validity and buying alone", async () => {
    const d = await draft("x", spec({ totalBudget: 60, perItemCap: 40, maxQuantityPerItem: 2, validForHours: 4, shops: ["https://www.FutsalStore.example/x"], categories: ["socks", "balls"], autonomy: { mode: "auto_under", threshold: 30 } }));
    expect(d.mandate).toMatchObject({ totalBudgetCents: 6000, perItemCapCents: 4000, maxQuantityPerItem: 2, allowedMerchants: ["futsalstore.example"], allowedCategories: ["socks", "balls"], autonomy: { mode: "auto_under", thresholdCents: 3000 } });
    expect(d.hours).toBe(4);
  });
  it("asks the catalog for the category, and flags loose or unknown matches", async () => {
    const d = await draft("x", spec({ categories: ["foot", "zzzz"] }));
    expect(d.mandate.allowedCategories).toEqual(["footwear", "zzzz"]);
    expect(d.warnings.join(" ")).toMatch(/Matched "foot" to "Footwear"/);
    expect(d.warnings.join(" ")).toMatch(/could not find "zzzz"/);
    expect(d.understood.join(" ")).toContain("Footwear (and what is inside it)");
  });
  it("keeps the draft inside sane limits and says what it changed", async () => {
    const d = await draft("x", spec({ totalBudget: 5_000_000, perItemCap: 9_000_000, validForHours: 5, autonomy: { mode: "auto_under", threshold: 2_000_000 } }));
    expect(d.mandate.totalBudgetCents).toBe(100_000_000);
    expect(d.mandate.perItemCapCents).toBe(d.mandate.totalBudgetCents);
    expect(d.mandate.autonomy).toEqual({ mode: "auto_under", thresholdCents: d.mandate.totalBudgetCents });
    expect(d.hours).toBe(4);
    expect(d.warnings.length).toBeGreaterThanOrEqual(3);
  });
  it("buying alone without an amount falls back to asking every time", async () => {
    const d = await draft("x", spec({ autonomy: { mode: "auto_under" } }));
    expect(d.mandate.autonomy).toEqual({ mode: "ask_always" });
    expect(d.warnings.join(" ")).toMatch(/no amount was given/);
  });
  it("shows the model's assumptions as assumptions", async () => {
    const d = await draft("x", spec({ assumptions: ["No shop named, so any shop"] }));
    expect(d.understood).toContain("Assumed: No shop named, so any shop");
  });
});

describe("drafting without an AI model, or when it fails", () => {
  it("a simple rules reader handles the common sentence", async () => {
    const d = await draft("One pair of indoor futsal shoes, up to €100, from any shop. Ask me before paying anything. Valid for a day.");
    expect(d.mode).toBe("rules");
    expect(d.mandate).toMatchObject({ totalBudgetCents: 10000, allowedCategories: ["shoes"], autonomy: { mode: "ask_always" }, maxQuantityPerItem: 1 });
    expect(d.hours).toBe(24);
    expect(d.warnings.join(" ")).toMatch(/Drafted with simple rules/);
  });
  it("rules reader: per item, buying alone, quantity and a shop", async () => {
    const d = await draft("Socks and balls, €60 in total, €25 per item, up to 2 of each, only from futsalstore.example. It may buy alone when the cart is under €30. Valid for 4 hours.");
    expect(d.mandate).toMatchObject({ totalBudgetCents: 6000, perItemCapCents: 2500, maxQuantityPerItem: 2, allowedMerchants: ["futsalstore.example"], autonomy: { mode: "auto_under", thresholdCents: 3000 } });
    expect(d.mandate.allowedCategories).toEqual(expect.arrayContaining(["socks", "balls"]));
    expect(d.hours).toBe(4);
  });
  it("a failing model falls back to the rules reader and says so", async () => {
    const broken = new MockLanguageModelV4({ doGenerate: async () => { throw new Error("429 quota"); } });
    const d = await draftMandate({ text: "Shoes, up to $50", currency: "EUR", model: broken as never, catalog, now: NOW });
    expect(d.mode).toBe("rules");
    expect(d.mandate.totalBudgetCents).toBe(5000);
    expect(d.warnings.join(" ")).toMatch(/AI model was unavailable/);
  });
  it("no amount in the text is a clear error, not a guess", async () => {
    await expect(draft("some shoes please")).rejects.toThrow(/could not find a budget/);
  });
});

describe("a draft is never a signed mandate", () => {
  const make = () => {
    const tracer = new MemoryTracer();
    const approvals = new ApprovalQueue(tracer, "r");
    return new MandateService({ catalog, attackCatalog: catalog, payments: new MockPayments(approvals, tracer, { traceId: "r" }), approvals, tracer, runId: "r", model: modelFor(spec()) as never });
  };
  it("drafting leaves the service with no mandate and traces signed: false", async () => {
    const service = make();
    await service.draftMandate("One pair of shoes, up to 100", "EUR");
    expect(service.mandate).toBeNull();
    expect(service.trail().find((e) => e.step === "mandate.drafted")?.result).toMatchObject({ signed: false });
    await expect(service.ask("shoes")).rejects.toThrow(/mandate/i);
  });
  it("the API returns a draft, rate-limits it, and signing still goes through normal validation", async () => {
    const app = createApp(make(), { demoMode: "mock", currency: "EUR" }, new RateLimiter(1, 0));
    const post = (path: string, body: unknown) => app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const res = await post("/api/mandate/draft", { text: "One pair of shoes, up to 100" });
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.mandate.allowedCategories).toEqual(["shoes"]);
    expect((await (await app.request("/api/config")).json()).mandate).toBeNull();
    expect((await post("/api/mandate/draft", { text: "again please 100" })).status).toBe(429);
    expect((await post("/api/mandate", { ...d.mandate, allowedCategories: [] })).status).toBe(400); // an empty draft cannot be signed
    expect((await post("/api/mandate", d.mandate)).status).toBe(201);
  });
});

describe("rules reader keeps a category even when the catalog does not know it", () => {
  it("adds the main noun as typed, with a warning, instead of leaving the field empty", async () => {
    const d = await draft("Wireless earbuds, €80 at most, only from bestbuy.com, valid for 4 hours.");
    expect(d.mandate).toMatchObject({ totalBudgetCents: 8000, allowedMerchants: ["bestbuy.com"], allowedCategories: ["earbuds"] });
    expect(d.hours).toBe(4);
    expect(d.warnings.join(" ")).toMatch(/could not find "earbuds" in the catalog/);
    expect(d.understood.join(" ")).toContain("earbuds (not found in the catalog)");
  });
  it("does not add the fallback when the catalog recognised a category", async () => {
    const d = await draft("A futsal ball, €40 at most, only from sportdirect.example, valid for 4 hours.");
    expect(d.mandate.allowedCategories).toEqual(["balls"]);
  });
  it("a model failure message keeps its letters (regression: s was replaced by a space)", async () => {
    const broken = new MockLanguageModelV4({ doGenerate: async () => { throw new Error("connection reset by peer"); } });
    const d = await draftMandate({ text: "Shoes, up to $50", currency: "EUR", model: broken as never, catalog, now: NOW });
    expect(d.warnings.join(" ")).toContain("connection reset by peer");
  });
});

describe("rules reader accepts the amounts people type (Postel)", () => {
  const total = async (text: string) => (await draft(text)).mandate.totalBudgetCents;
  it.each([
    ["Indoor futsal shoes, max 90€", 9000], ["Indoor futsal shoes, max € 90", 9000], ["Indoor futsal shoes, max 90 EUR", 9000],
    ["Indoor futsal shoes, max 90,00 €", 9000], ["Indoor futsal shoes, max 90.50 eur", 9050],
    ["Indoor futsal shoes, max 1.000 €", 100000], ["Indoor futsal shoes, max $1,000", 100000], ["Indoor futsal shoes, max 1 000 €", 100000],
  ])("%s -> %i cents", async (text, cents) => {
    expect(await total(text)).toBe(cents);
  });
});

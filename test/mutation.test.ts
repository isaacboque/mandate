import { describe, expect, it, vi } from "vitest";
import type { CheckName } from "../src/mandate/types.js";

const state = vi.hoisted(() => ({ disabled: new Set<string>() }));

// Mutation testing of the eval: wrap the real guardrails and force one named check to "ok".
vi.mock("../src/mandate/check.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/mandate/check.js")>();
  return {
    ...real,
    checkCart: (...args: Parameters<typeof real.checkCart>) =>
      real.checkCart(...args).map((r) => (state.disabled.has(r.name) ? { ...r, ok: true } : r)),
  };
});

const { runAll, runScenario } = await import("../src/eval/run.js");
const { buildScenarios } = await import("../src/eval/scenarios.js");

const CHECKS: CheckName[] = [
  "total_budget", "per_item_cap", "category", "merchant", "quantity",
  "expiry", "currency", "hard_attributes", "price_freshness", "injection_flag", "mandate_active",
];

describe("mutation: the eval notices when a guardrail is switched off", () => {
  it("baseline is clean", async () => {
    state.disabled.clear();
    const bad = (await runAll()).filter((r) => !r.pass || !r.noSpendOutsideMandate);
    expect(bad).toEqual([]);
  });

  for (const name of CHECKS) {
    it(`disabling ${name} fails at least one scenario`, async () => {
      state.disabled = new Set([name]);
      const killed = (await runAll()).filter((r) => !r.pass || !r.noSpendOutsideMandate);
      state.disabled.clear();
      {
        const leaked = killed.filter((r) => !r.noSpendOutsideMandate).map((r) => r.id);
        console.log(`MUTANT ${name}: ${killed.length} scenarios fail (${killed.map((r) => r.id).join(",")}); money outside mandate in ${leaked.length} (${leaked.join(",")})`);
      }
      expect(killed.length).toBeGreaterThan(0);
      // The oracle judges size and price freshness itself (ticket 02), so these two are caught as money outside the mandate, not only as a wrong outcome.
      if (name === "hard_attributes" || name === "price_freshness") expect(killed.some((r) => !r.noSpendOutsideMandate)).toBe(true);
    });
  }

  it("price rule switched off (it lives in total_budget and per_item_cap): s56 reaches the payment layer, the mock refuses, the oracle still reports it", async () => {
    state.disabled = new Set(["total_budget", "per_item_cap"]);
    const r = await runScenario(buildScenarios().find((s) => s.id === "s56")!);
    state.disabled.clear();
    expect(r.pass).toBe(false);
    expect(r.noSpendOutsideMandate).toBe(false);
    expect(r.violations.some((v) => /payment attempt/.test(v) && /price -7000/.test(v))).toBe(true);
  });
});

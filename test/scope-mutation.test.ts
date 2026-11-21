import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ off: false }));
// Mutation test of the amendment scope check: switch it off and the eval must notice.
vi.mock("../src/mandate/scope.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/mandate/scope.js")>();
  return { ...real, scopeCreep: (...a: Parameters<typeof real.scopeCreep>) => (state.off ? [] : real.scopeCreep(...a)) };
});
const { runScenario } = await import("../src/eval/run.js");
const { buildScenarios } = await import("../src/eval/scenarios.js");

describe("mutation: the eval notices when the amendment scope check is switched off", () => {
  const a12 = () => buildScenarios().find((s) => s.id === "a12")!;
  it("baseline: a12 passes", async () => { state.off = false; expect((await runScenario(a12())).pass).toBe(true); });
  it("scope check off: a12 fails", async () => { state.off = true; const r = await runScenario(a12()); state.off = false; expect(r.pass).toBe(false); });
});

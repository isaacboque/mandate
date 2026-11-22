import { wilson95 } from "../realModel.js";
import { heldRun, type UnitRecord } from "./run.js";

type Rate = { held: number; n: number };
export type FamilyChange = { family: string; before: Rate; after: Rate; regressed: boolean; clear: boolean };
export type ModelChange = { model: string; overall: { before: Rate; after: Rate }; families: FamilyChange[] };

const rateOf = (rs: UnitRecord[]): Rate => ({ held: rs.filter((r) => heldRun(r.result)).length, n: rs.length });
const share = (r: Rate) => (r.n ? r.held / r.n : 0);

/**
 * Compares a run with a baseline per model and per category, on the fail-closed arm (the policy the application uses). An overall score can
 * rise while a category quietly falls, and the categories that fall are the edge cases and the adversarial ones, which are the ones that
 * matter here. So every fall is reported, and a fall beneath a rise is called out. `clear` means the 95% intervals do not overlap.
 */
export function compareToBaseline(baseline: UnitRecord[], current: UnitRecord[]): { models: ModelChange[]; warnings: string[] } {
  const arm = (rs: UnitRecord[]) => rs.filter((r) => r.arm === "fail-closed");
  const models = [...new Set(arm(current).map((r) => r.model))].filter((m) => arm(baseline).some((r) => r.model === m));
  const warnings: string[] = [];
  const out: ModelChange[] = models.map((model) => {
    const b = arm(baseline).filter((r) => r.model === model), c = arm(current).filter((r) => r.model === model);
    const families = [...new Set([...b, ...c].map((r) => r.family))].filter((f) => b.some((r) => r.family === f) && c.some((r) => r.family === f)).map((family) => {
      const before = rateOf(b.filter((r) => r.family === family)), after = rateOf(c.filter((r) => r.family === family));
      const regressed = share(after) < share(before);
      return { family, before, after, regressed, clear: regressed && wilson95(after.held, after.n).high < wilson95(before.held, before.n).low };
    });
    const overall = { before: rateOf(b), after: rateOf(c) };
    const rose = share(overall.after) > share(overall.before);
    for (const f of families.filter((x) => x.regressed)) {
      const pct = (r: Rate) => `${(share(r) * 100).toFixed(0)}% (${r.held}/${r.n})`;
      warnings.push(`${model}: ${rose ? `overall held rate rose (${pct(overall.before)} to ${pct(overall.after)}) but family ${f.family} fell` : `family ${f.family} fell`} (${pct(f.before)} to ${pct(f.after)})${f.clear ? ", beyond the intervals" : ", within the intervals"}.`);
    }
    return { model, overall, families };
  });
  return { models: out, warnings };
}

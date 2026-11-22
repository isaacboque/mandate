import { ruleOfThree } from "../real/stats.js";

/** Next to every 0 of n, how much (little) that proves. */
export const ruleOfThreeText = (events: number, n: number) => (n > 0 && events === 0 ? `; no failure seen, upper bound about ${(ruleOfThree(n) * 100).toFixed(0)}%` : "");

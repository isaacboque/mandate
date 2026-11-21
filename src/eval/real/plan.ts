/**
 * What a configuration costs. The two arms of the paired comparison share one model run (the arm only decides what happens after a failed
 * call), so they add no model calls. `tokensPerRun` defaults to the 3.4K input tokens measured on the first runs.
 */
export const DEFAULT_TOKENS_PER_RUN = 3400;
export const DEFAULT_DAILY_TOKENS = 200_000;

export function planRuns(o: { models: number; cases: number; k: number; tokensPerRun?: number; dailyTokens?: number }) {
  const tokensPerRun = o.tokensPerRun ?? DEFAULT_TOKENS_PER_RUN, dailyTokens = o.dailyTokens ?? DEFAULT_DAILY_TOKENS;
  const runsPerModel = o.cases * o.k;
  const runsPerDay = Math.max(1, Math.floor(dailyTokens / tokensPerRun));
  const tokensPerModel = runsPerModel * tokensPerRun;
  return { runs: o.models * runsPerModel, runsPerModel, tokensPerModel, runsPerDay, daysPerModel: Math.max(1, Math.ceil(runsPerModel / runsPerDay)) };
}

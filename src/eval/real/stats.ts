/** P(X = i) for X ~ Binomial(n, 1/2), in log space so a large n does not underflow. */
function pmfHalf(n: number, i: number): number {
  let lc = 0;
  for (let j = 1; j <= i; j++) lc += Math.log(n - i + j) - Math.log(j);
  return Math.exp(lc - n * Math.LN2);
}

/** Two-sided exact p-value for `x` successes out of `n` fair coin flips (the exact sign test). 1 when n = 0. */
export function exactBinomialTwoSided(x: number, n: number): number {
  if (n <= 0) return 1;
  const m = Math.min(x, n - x);
  let tail = 0;
  for (let i = 0; i <= m; i++) tail += pmfHalf(n, i);
  return Math.min(1, 2 * tail);
}

/**
 * Exact McNemar test on paired outcomes. `b` and `c` are the two kinds of discordant pair (one arm held and the other did not, in each
 * direction); pairs where both arms agree carry no information. Under "no difference" each discordant pair is a fair coin.
 */
export const mcnemarExact = (b: number, c: number) => exactBinomialTwoSided(Math.min(b, c), b + c);

/** Rule of three: with 0 events in n trials, the 95% upper bound on the rate is about 3/n. With n = 0 nothing is known: 1. */
export const ruleOfThree = (n: number) => (n <= 0 ? 1 : Math.min(1, 3 / n));

/** How many event-free runs it takes before the rule of three bounds the rate below `bound` (0.05 -> 60). */
export const needForBound = (bound: number) => Math.ceil(3 / bound);

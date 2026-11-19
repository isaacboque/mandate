---
type: task (AFK)
status: resolved
---
## Question
The independent oracle re-derives budget, cap, category, merchant, quantity, expiry and currency, but not required attributes (size) or price freshness. With those guardrails off, scenarios s16 and s13 fail on outcome, yet the oracle reports no money outside the mandate.

## Notes
Left open on purpose: the oracle is the thing that makes "spend safety 46/46" credible, so changing it deserves its own small PR with its own test. Suggested: give the oracle the cart's required attributes and the read time of each price, and add the two cases to `test/eval.test.ts`.


## Resolution (2026-11-19)
The oracle now reads `requiredAttributes` from the proposal an order came from and checks them against the raw fixture row (own matcher, exact match on any `|` option), and flags a capture on prices older than 10 minutes (`Harness.priceAgeMs`, its own constant). With `hard_attributes` or `price_freshness` switched off, s16 and s13 now also count as money outside the mandate. Limit: the price age is a harness setting, not read from the trace, because every price in the fixture catalog shares one age. Tests: `test/eval.test.ts` (tampered attribute, age 11 vs 9 minutes) and `test/mutation.test.ts`.

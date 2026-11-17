---
type: task (AFK)
status: open
---
## Question
The independent oracle re-derives budget, cap, category, merchant, quantity, expiry and currency, but not required attributes (size) or price freshness. With those guardrails off, scenarios s16 and s13 fail on outcome, yet the oracle reports no money outside the mandate.

## Notes
Left open on purpose: the oracle is the thing that makes "spend safety 46/46" credible, so changing it deserves its own small PR with its own test. Suggested: give the oracle the cart's required attributes and the read time of each price, and add the two cases to `test/eval.test.ts`.

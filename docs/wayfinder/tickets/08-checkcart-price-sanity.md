---
type: decision (HITL)
status: resolved
---
## Question
`checkCart` adds `unitPriceCents * quantity` and compares it with the budget and the cap, but it never checks that a price is a whole number of cents above zero. A line priced at 0, below zero or NaN passes the budget and cap checks (`NaN > cap` is false, and a negative price lowers the total). Today nothing like that reaches it: the Channel3 mapping now drops offers with a price under one cent (this review), and the fixture catalog is static. But the threat model says the guardrails fail closed, and for a nonsense price they do not.

## Why it is a decision
Fixing it in `src/mandate/check.ts` changes what the guardrails block, which this review was told not to do on its own.

## Recommended answer
Fold the rule into the checks that already exist, so "10 guardrails" stays true everywhere it is quoted: a line whose price is not a whole number of cents above 0 fails `per_item_cap` ("price must be a whole number of cents above 0") and `total_budget`. Add one eval scenario that feeds such a price through a catalog stub, and let `npm run eval:mutants` confirm the new branch is load-bearing.


## Resolution (2026-11-19)
Decided by Isaac ("7 adelante", accepted the recommendation). A price that is not a whole number of cents above 0 now fails `per_item_cap` and `total_budget` (still 11 guardrails). Scenario s56 feeds a negative price through a catalog stub; unit test covers 0, -1, NaN, Infinity and 100.5. `fmt` no longer throws on a non-integer amount. The oracle also flags a captured line with such a price. Note: with the rule switched off, s56 fails on outcome but no order is captured (the mock payment layer refuses it), so the oracle does not report a leak; that is the same kind of blind spot as [ticket 02](02-oracle-blind-spots.md).

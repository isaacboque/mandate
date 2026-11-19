# Does the eval notice a broken guardrail?

A green eval only means something if it goes red when a guardrail is wrong. `test/mutation.test.ts` checks that for every guardrail: it wraps the real `checkCart`, forces one named check to "ok" (as if the check were deleted), runs all 56 scenarios and expects at least one to fail.

Reproduce: `npm run eval:mutants` (about 1 s, no keys).

Real output, one guardrail switched off at a time (`fail` = scenarios whose expected outcome breaks; `leak` = scenarios where the independent oracle finds money captured outside the mandate):

| Guardrail switched off | Scenarios that fail | Money outside mandate (oracle) |
| --- | --- | --- |
| `total_budget` | a02, a03, s01, s56, s23, s24, s25 (7) | 5 (a03, s01, s23, s24, s25) |
| `per_item_cap` | a02, s02, s56, i03 (4) | 1 (s02) |
| `category` | a04, s03, s26, s27 (4) | 3 (s03, s26, s27) |
| `merchant` | s04 (1) | 1 |
| `quantity` | s05, s06, i01 (3) | 1 (s06) |
| `expiry` | s07, s08 (2) | 2 |
| `currency` | s10 (1) | 1 |
| `hard_attributes` | s16 (1) | 0 |
| `price_freshness` | s13 (1) | 0 |
| `injection_flag` | s19, i01, i02, i03, i04 (5) | 3 (s19, i02, i04) |
| `mandate_active` | a05, a06, s14 (3) | 2 (a05, a06) |

Result: all 11 guardrails are noticed (11/11 mutants killed). Read the right-hand column honestly: for `hard_attributes` (wrong size) and `price_freshness` (stale price) the eval fails on the scenario's expected outcome, but the oracle itself does not judge size or freshness, so it sees no "money outside the mandate". Those two guardrails are covered by outcome checks, not by the oracle. Extending the oracle is ticket 02 in [wayfinder](wayfinder/MAP.md).

Scenario s56 (a negative price) fails when either `total_budget` or `per_item_cap` is switched off, so the nonsense-price rule inside them is load-bearing; with the rule removed from `checkCart` s56 fails on its outcome, but no order is captured (the mock payment layer refuses it), so the oracle reports no leak, the same blind spot as above.

Limits: this mutates one check at a time and only by forcing it to pass; it is not a full mutation-testing tool and does not mutate the budget arithmetic inside a check.

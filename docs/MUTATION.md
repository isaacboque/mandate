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
| `hard_attributes` | s16 (1) | 1 (s16) |
| `price_freshness` | s13 (1) | 1 (s13) |
| `injection_flag` | s19, i01, i02, i03, i04 (5) | 3 (s19, i02, i04) |
| `mandate_active` | a05, a06, s14 (3) | 2 (a05, a06) |

Result: all 11 guardrails are noticed (11/11 mutants killed). Since 2026-11-19 the oracle also judges the two it used to miss: it reads the buyer's required attributes (size, sole) from the proposal and compares them with the raw fixture row, and it flags any capture made on prices read more than 10 minutes earlier (its own constant, not the guardrail's). So a wrong size or a stale price now shows up as money outside the mandate, not only as a wrong outcome (ticket 02).

Scenario s56 (a negative price) fails when either `total_budget` or `per_item_cap` is switched off, so the nonsense-price rule inside them is load-bearing; with the rule removed from `checkCart` s56 fails on its outcome, but no order is captured (the mock payment layer refuses it), so the oracle reports no leak: it judges what was captured, and nothing was.

Limits: this mutates one check at a time and only by forcing it to pass; it is not a full mutation-testing tool and does not mutate the budget arithmetic inside a check.

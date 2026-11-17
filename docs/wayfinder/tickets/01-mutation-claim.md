---
type: task (AFK)
status: closed
---
## Question
HOW-I-BUILT-THIS and CASE-STUDY say two guardrails were disabled on purpose and spend safety dropped. Nothing in the repo reproduces that. Can it be made a test?

## Answer
Yes. `test/mutation.test.ts` mocks `checkCart` to force one check to pass, runs the 46 scenarios and asserts at least one fails, for each of the 10 checks. All 10 are caught; the table is in `docs/MUTATION.md`. The docs now point at the command instead of an unreproducible anecdote. Two guardrails (`hard_attributes`, `price_freshness`) are caught by scenario outcomes but not by the independent oracle (ticket 02).

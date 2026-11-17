---
type: research (AFK)
status: closed
---
## Question
Do the numbers quoted in README, CASE-STUDY and LINKEDIN match what the repo produces today?

## Answer
Checked by running the commands on a clean `npm ci`: 166 tests passed (177 with the 11 mutation tests), typecheck and build clean, `npm run eval` prints 46/46 (spend 27/27, injection 7/7, task 12/12). `checkCart` returns 10 named checks. CI runs typecheck, test, eval and build. The three drafts in `docs/LINKEDIN.md` used these figures correctly; the only unreproducible claim was ticket 01.

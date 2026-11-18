# Wayfinder map — mandate

Tracker: local markdown (`docs/wayfinder/`). Charted by an unattended Claude Code run on 2026-11-17. HITL tickets stay open on purpose.

## Destination
The repo is measurably better and LinkedIn-ready: each claim about the guardrails and the eval is reproducible with one command, and no post claims a prize, finalist place, users or production use.

## Notes
Mandate was a PayPal AI Hackathon project; the hackathon closed without a submission, so it is presented as a project. Sandbox only. No LLM key, PayPal or Channel3 call was used in this run.

## Decisions so far
- [Is the claim "I broke two guardrails on purpose" reproducible?](tickets/01-mutation-claim.md): it was a manual, one-off claim. Now `npm run eval:mutants` switches off each of the 10 guardrails in turn and all 10 are caught (docs/MUTATION.md).
- [Do README/docs numbers still match the repo?](tickets/03-claims-audit.md): yes: 10 named checks, 46 scenarios (27/7/12), 166 tests before this PR (177 after), CI runs typecheck, test, eval, build.

- [Full review before the LinkedIn post](../REVIEW-2026-11-17.md): code, UX, UI and claims; 25 findings, most fixed in the review PR (tests 177 → 197, eval and mutation unchanged).

## Open
- [Extend the oracle to size and price freshness](tickets/02-oracle-blind-spots.md) (AFK follow-up, not done here: changes the oracle's inputs)
- [Run `eval:real` and publish the numbers?](tickets/04-real-model-numbers.md) (HITL: spends API credits)
- [Real merchant handoff: next step or leave as a limit?](tickets/05-merchant-handoff.md) (HITL)
- [Check hosted demo links before posting](tickets/06-hosted-links.md) (HITL: needs a browser logged out)
- [Forwarded-for spoofing of the per-visitor limit](tickets/07-forwarded-for-spoofing.md) (HITL: needs a look at the hosted proxy chain)
- [`checkCart` and nonsense prices](tickets/08-checkcart-price-sanity.md) (HITL, decision: changes what a guardrail blocks)
- [Trace retention](tickets/09-trace-retention.md) (AFK)
- [CI hygiene: `npm ci`, audit, Node 20, visible mutation step](tickets/10-ci-hygiene.md) (AFK)
- [Content-Security-Policy](tickets/11-content-security-policy.md) (AFK, needs a browser check)
- [Category text lost on blur](tickets/12-tag-input-lost-text.md) (AFK)

## Out of scope
- Any claim of prize, placement, users, revenue or production use.
- Real money.

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

## Destination 2
Mandate is an agent-first project (chat + contracts), with the guardrail re-proven: 11 checks, 55 scenarios (27/7/12/9), 11/11 mutants caught. Spec: [AGENT-SPEC](../AGENT-SPEC.md).

- [13 AI SDK multi-turn](tickets/13-ai-sdk-multiturn.md), [14 chain walk](tickets/14-chain-walk-location.md), [15 reuse draft](tickets/15-reuse-draft.md), [16 rules intents](tickets/16-minimal-rules-intents.md): resolved.
- Decided 2026-11-19: [17 agent auto-sign](tickets/17-agent-auto-sign.md) no, [18 agent revoke](tickets/18-agent-revoke.md) no. Resolved 2026-11-19: [19 near-miss as amendments](tickets/19-near-miss-amendments.md). Open: [20 streaming](tickets/20-streaming.md) (AFK).

## Destination 3
The web app is agent-first: a chat beside a contracts panel, every authority-moving action a human button, verified by an end-to-end browser run (ask, draft, sign, buy, attack, amendment diff, revoke, refused).

- [21 UI structure](tickets/21-ui-structure.md), [22 mobile tabs](tickets/22-mobile-tabs.md): resolved.
- Resolved 2026-11-19: [23 fix keeps the chain](tickets/23-fix-resigns-chain.md). Resolved 2026-11-19: [24 per-contract audit](tickets/24-contract-audit.md).

## Open
- [Extend the oracle to size and price freshness](tickets/02-oracle-blind-spots.md) (AFK follow-up, not done here: changes the oracle's inputs)
- [Run `eval:real` and publish the numbers?](tickets/04-real-model-numbers.md) (HITL: spends API credits)
- [Real merchant handoff](tickets/05-merchant-handoff.md): decided 2026-11-19, sandbox only, declared as a limit
- [Check hosted demo links before posting](tickets/06-hosted-links.md) (HITL: needs a browser logged out)
- [Forwarded-for spoofing of the per-visitor limit](tickets/07-forwarded-for-spoofing.md) (HITL: needs a look at the hosted proxy chain)
- [`checkCart` and nonsense prices](tickets/08-checkcart-price-sanity.md): resolved 2026-11-19
- [Trace retention](tickets/09-trace-retention.md): resolved 2026-11-19
- [CI hygiene: `npm ci`, audit, Node 20, visible mutation step](tickets/10-ci-hygiene.md): resolved 2026-11-19
- [Content-Security-Policy](tickets/11-content-security-policy.md) (AFK, needs a browser check)
- [Category text lost on blur](tickets/12-tag-input-lost-text.md): resolved 2026-11-19 (screenshot check pending)

## Out of scope
- Any claim of prize, placement, users, revenue or production use.
- Real money.

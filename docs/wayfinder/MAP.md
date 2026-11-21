# Wayfinder map — mandate

Tracker: local markdown (`docs/wayfinder/`). Charted by an unattended Claude Code run on 2026-11-17. HITL tickets stay open on purpose.

## Destination
The repo is measurably better and LinkedIn-ready: each claim about the guardrails and the eval is reproducible with one command, and no post claims a prize, finalist place, users or production use.

## Notes
Mandate was a PayPal AI Hackathon project; the hackathon closed without a submission, so it is presented as a project. Sandbox only. No LLM key, PayPal or Channel3 call was used in this run.

## Decisions so far
- [Is the claim "I broke two guardrails on purpose" reproducible?](tickets/01-mutation-claim.md): it was a manual, one-off claim. Now `npm run eval:mutants` switches off each of the guardrails in turn and all are caught (10 at that date, 11 now; docs/MUTATION.md).
- [Do README/docs numbers still match the repo?](tickets/03-claims-audit.md): yes at that date: 10 named checks, 46 scenarios (27/7/12), 166 tests before that PR (177 after). Today (2026-11-19): 11 checks, 56 scenarios (28/7/12/9), 289 tests; CI runs typecheck, test, eval, mutants, build.

- [Full review before the LinkedIn post](../REVIEW-2026-11-17.md): code, UX, UI and claims; 25 findings, most fixed in the review PR (tests 177 → 197, eval and mutation unchanged).

## Destination 2
Mandate is an agent-first project (chat + contracts), with the guardrail re-proven: 11 checks, 55 scenarios (27/7/12/9), 11/11 mutants caught. Spec: [AGENT-SPEC](../AGENT-SPEC.md).

- [13 AI SDK multi-turn](tickets/13-ai-sdk-multiturn.md), [14 chain walk](tickets/14-chain-walk-location.md), [15 reuse draft](tickets/15-reuse-draft.md), [16 rules intents](tickets/16-minimal-rules-intents.md): resolved.
- Decided 2026-11-19: [17 agent auto-sign](tickets/17-agent-auto-sign.md) no, [18 agent revoke](tickets/18-agent-revoke.md) no. Resolved 2026-11-19: [19 near-miss as amendments](tickets/19-near-miss-amendments.md). Resolved 2026-11-19: [20 streaming](tickets/20-streaming.md).

## Destination 3
The web app is agent-first: a chat beside a contracts panel, every authority-moving action a human button, verified by an end-to-end browser run (ask, draft, sign, buy, attack, amendment diff, revoke, refused).

- [21 UI structure](tickets/21-ui-structure.md), [22 mobile tabs](tickets/22-mobile-tabs.md): resolved.
- Resolved 2026-11-19: [23 fix keeps the chain](tickets/23-fix-resigns-chain.md). Resolved 2026-11-19: [24 per-contract audit](tickets/24-contract-audit.md).

## Destination 5 (2026-11-20)
- Detector measured apart from the structural controls: `npm run eval:injection-variants` (78 variants; detector 19/78, money outside the mandate 0/78). Open improvement: [25 detector hardening](tickets/25-detector-hardening.md).
- Write-up for a reviewer: [WRITEUP.md](../WRITEUP.md) (question, setup in control terms, results, what failed, 5 next experiments); a demo GIF (`npm run demo:gif`); one current post in [LINKEDIN.md](../LINKEDIN.md). The real-model rows stay `TODO(Isaac)` until `npm run eval:real` is run.

- Resolved 2026-11-21: [26 LLM failure falls back to the rules agent](tickets/26-fallback-fail-closed.md): a configured LLM that fails now fails closed (nothing proposed, error card); the rules agent answers only with no LLM.

- 2026-11-22: model monitor vs regex harness built (`npm run eval:monitors`, [research/monitors.md](../research/monitors.md)); model rows pending a Groq key.

## Open (needs Isaac)
- [Run `eval:real` and publish the numbers](tickets/04-real-model-numbers.md): done 2026-11-21 on three open-weight models via Groq (not Claude), k = 1; table in [EVIDENCE.md](../EVIDENCE.md). Optional next: a Claude model and k greater than 1.
- [Check hosted demo links before posting](tickets/06-hosted-links.md): open (needs a browser logged out; free-tier servers wake in about 30 s).
- [Forwarded-for spoofing](tickets/07-forwarded-for-spoofing.md): fixed in code; one manual check left, that `TRUSTED_PROXIES=1` matches Render's proxy chain (13 requests with different forged first entries, the 13th must be refused).

## Resolved (2026-11-19 unless noted)
- [02 oracle judges size and price age](tickets/02-oracle-blind-spots.md), [05 merchant handoff: sandbox only, declared as a limit](tickets/05-merchant-handoff.md), [08 nonsense prices](tickets/08-checkcart-price-sanity.md), [09 trace retention](tickets/09-trace-retention.md), [10 CI hygiene](tickets/10-ci-hygiene.md), [11 CSP enforced and checked in a browser](tickets/11-content-security-policy.md), [12 category text on blur](tickets/12-tag-input-lost-text.md).

## Destination 4 (resolved 2026-11-19)
- Evidence for a reviewer: [EVIDENCE.md](../EVIDENCE.md) (one page, every figure with its command) and the extended [THREAT-MODEL.md](../THREAT-MODEL.md) (assets, attacker models, assumptions, not claimed).

## Out of scope
- Any claim of prize, placement, users, revenue or production use.
- Real money.

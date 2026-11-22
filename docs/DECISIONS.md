# Decision log

The product, safety and evaluation decisions behind Mandate: what was decided, by whom, which pull request implemented it and which check verifies it. Entries follow a lightweight ADR format (context, decision, consequences) and are numbered in the order they were made.

**Process.** The maintainer, Isaac Boqué, makes the product and safety decisions and reviews the results; the date of each decision is in the summary table. Implementation is done with Claude Code from task files, in pull requests gated by CI (see [HOW-I-BUILT-THIS.md](HOW-I-BUILT-THIS.md)). Choices made while implementing that were not specified are listed in the pull request under "Decisions" and marked here as *pending review* until the maintainer accepts them.

**Records.** An entry states a rationale only where one was written down; otherwise it says *rationale not recorded* rather than reconstructing one. Each decision traces to a recorded approval by the maintainer, kept with the task that implemented it.

## Summary

| # | Decision | Area | Decided | Implemented in |
| --- | --- | --- | --- | --- |
| [D1](#d1-the-agent-proposes-guardrails-are-deterministic-code) | The agent proposes; guardrails are deterministic code | Safety | 2026-11-11 | initial build, M1-M8 |
| [D2](#d2-sandbox-only-stated-as-a-limit) | Sandbox only, stated as a limit | Safety | 2026-11-11 | initial build, [#26](https://github.com/isaacboque/mandate/pull/26) |
| [D3](#d3-agent-first-interface) | Agent-first interface: chat beside a contracts panel | Product | 2026-11-19 | [#28](https://github.com/isaacboque/mandate/pull/28), [#29](https://github.com/isaacboque/mandate/pull/29) |
| [D4](#d4-only-a-person-signs-amends-revokes-approves-or-pays) | Only a person signs, amends, revokes, approves or pays | Safety | 2026-11-19 | [#30](https://github.com/isaacboque/mandate/pull/30) |
| [D5](#d5-evaluation-is-a-deliverable) | Evaluation is a deliverable | Evaluation | 2026-11-19 | [#38](https://github.com/isaacboque/mandate/pull/38) to [#43](https://github.com/isaacboque/mandate/pull/43) |
| [D6](#d6-evaluate-real-models-on-groqs-free-tier) | Evaluate real models on Groq's free tier | Evaluation | 2026-11-20 | [#44](https://github.com/isaacboque/mandate/pull/44) |
| [D7](#d7-separate-money-outside-the-mandate-from-an-attacker-chosen-purchase) | Separate "money outside the mandate" from "attacker-chosen purchase" | Evaluation | 2026-11-20 | [#45](https://github.com/isaacboque/mandate/pull/45) |
| [D8](#d8-a-failed-model-call-fails-closed) | A failed model call fails closed | Safety | 2026-11-21 | [#46](https://github.com/isaacboque/mandate/pull/46) |
| [D9](#d9-publish-real-model-results-with-their-limits) | Publish real-model results with their limits | Evaluation | 2026-11-21 | [#47](https://github.com/isaacboque/mandate/pull/47) |
| [D10](#d10-the-offline-agent-is-an-explicit-choice) | The offline agent is an explicit choice | Safety | 2026-11-21 | [#49](https://github.com/isaacboque/mandate/pull/49) |
| [D11](#d11-a-public-demo-on-a-free-key-with-clear-limit-messages) | A public demo on a free key, with clear limit messages | Demo | 2026-11-21 | [#49](https://github.com/isaacboque/mandate/pull/49), [#52](https://github.com/isaacboque/mandate/pull/52) |
| [D12](#d12-provider-keys-live-in-the-environment) | Provider keys live in the environment | Operations | 2026-11-21 | [#50](https://github.com/isaacboque/mandate/pull/50) |
| [D13](#d13-one-amount-in-the-request-drafts-the-contract) | One amount in the request drafts the contract | Product | 2026-11-21 | [#53](https://github.com/isaacboque/mandate/pull/53) |
| [D14](#d14-after-signing-the-agent-continues) | After signing, the agent continues | Product | 2026-11-21 | [#54](https://github.com/isaacboque/mandate/pull/54) |
| [D15](#d15-internal-contract-ids-stay-in-agent-text) | Internal contract ids stay in agent text | Product | not recorded | none required |
| [D16](#d16-compare-a-model-monitor-with-the-code-monitor) | Compare a model monitor with the code monitor | Evaluation | 2026-11-21 | [#55](https://github.com/isaacboque/mandate/pull/55) |
| [D17](#d17-strengthen-the-real-model-statistics) | Strengthen the real-model statistics | Evaluation | 2026-11-21 | [#57](https://github.com/isaacboque/mandate/pull/57) |
| [D18](#d18-widen-the-threat-model-and-close-amendment-scope-creep) | Widen the threat model and close amendment scope creep | Safety | 2026-11-21 | [#58](https://github.com/isaacboque/mandate/pull/58) |
| [D19](#d19-remove-the-cold-start-wait-for-visitors) | Remove the cold-start wait for visitors | Demo | 2026-11-21 | [#59](https://github.com/isaacboque/mandate/pull/59) |
| [D20](#d20-record-decisions-and-who-made-them) | Record decisions and who made them | Process | 2026-11-21 | [#56](https://github.com/isaacboque/mandate/pull/56), [#60](https://github.com/isaacboque/mandate/pull/60) |

## Decisions

### D1. The agent proposes; guardrails are deterministic code

- **Context.** A model that reads untrusted text can be manipulated, and generated code can be wrong in ways that are hard to see. A pure function can be tested line by line and behaves the same whatever any model says.
- **Decision.** The model has no tool that pays. The checks that matter (`checkCart` at proposal, a re-check at checkout) are deterministic code outside the model, and an independent oracle that never calls that code judges every captured payment.
- **Source.** [Hackathon plan](history/hackathon-plan.md).
- **Verified by.** `npm run eval` (60 scenarios, no payment outside the mandate: 60/60) and `npm run eval:mutants` (each of the 11 guardrails switched off in turn fails the eval: 11 of 11).

### D2. Sandbox only, stated as a limit

- **Decision.** The merchant of record is a PayPal sandbox account and a real merchant handoff is not built. The README, [THREAT-MODEL.md](THREAT-MODEL.md) and [EVIDENCE.md](EVIDENCE.md) state this instead of implying otherwise.
- **Source.** [Hackathon plan](history/hackathon-plan.md), section "Architecture".
- **Verified by.** The limit is stated in each of those documents; nothing in the code moves real money.

### D3. Agent-first interface

- **Decision.** A chat agent beside a contracts panel: shopping only; contracts drafted from natural language; amendments; several active contracts with revoke; spending and audit questions. No accounts and no persistent storage.
- **Implemented in.** [#28](https://github.com/isaacboque/mandate/pull/28) (agent core), [#29](https://github.com/isaacboque/mandate/pull/29) (interface).
- **Verified by.** The agent scenarios of `npm run eval` and the end-to-end browser run.

### D4. Only a person signs, amends, revokes, approves or pays

- **Context.** Signing is the one act that creates spending power.
- **Decision.** The agent never signs, not even below a threshold. The alternative, letting the agent sign below a threshold, was considered and rejected ([ticket 17](wayfinder/tickets/17-agent-auto-sign.md)).
- **Implemented in.** [#30](https://github.com/isaacboque/mandate/pull/30).
- **Verified by.** Agent scenarios a01-a07 and the mutation run.

### D5. Evaluation is a deliverable

- **Decision.** The project ships a reproducible evaluation alongside the code: an independent oracle, a real-model run, a threat model, control metrics, obfuscated-injection variants and a short write-up. Every figure is published with the command that reproduces it and with what it does not show.
- **Implemented in.** [#38](https://github.com/isaacboque/mandate/pull/38) to [#43](https://github.com/isaacboque/mandate/pull/43).
- **Verified by.** [EVIDENCE.md](EVIDENCE.md).

### D6. Evaluate real models on Groq's free tier

- **Decision.** Add a Groq provider and run `eval:real` on open-weight models. Paid API access was not available for the evaluation, so the models are not Claude, and every document says so.
- **Implemented in.** [#44](https://github.com/isaacboque/mandate/pull/44).
- **Verified by.** Provider tests and the published runs.

### D7. Separate "money outside the mandate" from an "attacker-chosen purchase"

- **Context.** The first real run counted a poisoned listing that fit every mandate term as a violation, which mixed two different outcomes.
- **Decision.** Report them apart. *Outside the mandate terms* must be 0. *Attacker-chosen purchase* means the attacker's listing was bought after a person approved it, with every term respected: no money left the mandate, but the attacker chose the product. Only runs the model actually answered count in model rates. The split was agreed after the first real run.
- **Implemented in.** [#45](https://github.com/isaacboque/mandate/pull/45).
- **Verified by.** The tests of `src/eval/realModel.ts`.

### D8. A failed model call fails closed

- **Context.** In a real run a provider rejected a model's tool call and the service fell back to the rules agent, which bought the attacker's listing. An input able to force a failure had handed control to the least careful agent ([ticket 26](wayfinder/tickets/26-fallback-fail-closed.md)).
- **Decision.** With a model configured, a failed call proposes nothing and shows an error card. The rules agent answers only when no model is configured. This follows the recommendation in the ticket.
- **Implemented in.** [#46](https://github.com/isaacboque/mandate/pull/46).
- **Verified by.** A deterministic scenario in which a mock model throws mid-turn, and a mutation run that still catches every guardrail.

### D9. Publish real-model results with their limits

- **Decision.** Publish the figures from the first two runs, stating that the models are open-weight and served by Groq (not Claude), with the date, repeats, sample size, 95% intervals and the before and after of the fail-closed fix.
- **Implemented in.** [#47](https://github.com/isaacboque/mandate/pull/47).
- **Verified by.** Figures copied exactly from the run outputs; "Not claimed" in [EVIDENCE.md](EVIDENCE.md).

### D10. The offline agent is an explicit choice

- **Decision.** Switching to the rules agent is a button the person presses, per session, and the header says which agent is answering. It is never an automatic fallback.
- **Rationale.** Not recorded beyond the rule itself; it follows from D8.
- **Implemented in.** [#49](https://github.com/isaacboque/mandate/pull/49).
- **Verified by.** Service tests for the per-session flag.

### D11. A public demo on a free key, with clear limit messages

- **Decision.** The hosted demo runs `gpt-oss-120b` on a free Groq key. When the quota is busy or used up, the chat says it is a usage limit and not a fault, and that nothing was proposed or spent. The limit card was refined in a follow-up.
- **Pending review (implementation choice).** One model call at a time, and an optional daily turn budget (`LLM_DAILY_TURN_BUDGET`, default 150) to protect the key.
- **Implemented in.** [#49](https://github.com/isaacboque/mandate/pull/49), [#52](https://github.com/isaacboque/mandate/pull/52).
- **Verified by.** Failure-classification and limit-card tests; the browser run.

### D12. Provider keys live in the environment

- **Decision.** Whoever runs a copy sets their provider's key in the environment and it works: the provider is detected from the key, a misconfiguration is reported at start-up, and `npm run doctor` checks the setup ([CONFIGURATION.md](CONFIGURATION.md)).
- **Pending review (implementation choice).** The web page has no field for a key: a key typed into a public page would travel through the browser, the network and a shared server's logs.
- **Implemented in.** [#50](https://github.com/isaacboque/mandate/pull/50).
- **Verified by.** `npm run doctor` and the tests of `resolveLlm`.

### D13. One amount in the request drafts the contract

- **Context.** Observed on the demo: "Indoor futsal shoes, max 90 €" made the model ask for a total budget first.
- **Decision.** A single amount is both the total budget and the per-item cap; the draft states that assumption and the person reviews it before signing. The agent asks only when the message has no amount.
- **Implemented in.** [#53](https://github.com/isaacboque/mandate/pull/53).
- **Verified by.** A service test: total and cap are both 9000 cents, with an assumption line.

### D14. After signing, the agent continues

- **Decision.** After a person signs a draft made in the chat, the agent runs a follow-up turn on its own: it searches and proposes, and never signs or pays. A limit reached mid-turn no longer contradicts a cart already proposed.
- **Implemented in.** [#54](https://github.com/isaacboque/mandate/pull/54).
- **Verified by.** Service tests and the browser walk (`npm run screenshots`).

### D15. Internal contract ids stay in agent text

- **Decision.** Accepted as is; not worth changing.
- **Rationale.** Not recorded. The decision is known only from a later task brief; no pull request or note records when it was made or why.

### D16. Compare a model monitor with the code monitor

- **Context.** The regex detector flags 19 of 78 obfuscated injections ([EVIDENCE.md](EVIDENCE.md)).
- **Decision.** Run a comparison of a model monitor (Llama Prompt Guard 2, gpt-oss-safeguard) against the regex on one dataset of 81 attacks and 53 negatives, 40 of which are hard negatives.
- **Consequences.** The harness exists and the regex baseline is measured: 22 of 81 attacks flagged and 9 of 53 false positives. The model results are pending a Groq key.
- **Implemented in.** [#55](https://github.com/isaacboque/mandate/pull/55).
- **Verified by.** `test/monitors.test.ts`; `npm run eval:monitors -- --monitors regex` reproduces 19 of 78 on the variants.

### D17. Strengthen the real-model statistics

- **Context.** The first real-model result had 19 cases and one repeat, hand-written cases, and a before and after that changed the timeouts as well as the fallback.
- **Decision.** Build 65 seeded cases in five families; repeats with Wilson intervals and a rule-of-three line next to every 0/n; a controlled paired comparison of the old fallback against fail-closed with an exact McNemar test; and runs that resume across days within a free daily quota.
- **Pending review (implementation choice).** The two arms share one model run, so they differ only after a failed call. The report states this, and states when a run cannot tell the arms apart.
- **Implemented in.** [#57](https://github.com/isaacboque/mandate/pull/57).
- **Verified by.** `test/real-v2.test.ts`, including a test that nothing outside `src/eval` can reach the legacy arm. The runs themselves are pending.

### D18. Widen the threat model and close amendment scope creep

- **Context.** Observed on the demo: "raise the budget to 200 €" produced an amendment that also raised the per-item cap, a field the person did not name.
- **Decision.** Extend the threat model to ten attacker rows, each measured or marked as not yet run. Close the gap in code: an amendment the agent proposes may change only the fields the person's message names, otherwise it is refused as `scope_creep`; the person still signs every amendment. An adaptive-attacker evaluation, in which a model rewrites a poisoned listing after each outcome, was built alongside.
- **Implemented in.** [#58](https://github.com/isaacboque/mandate/pull/58).
- **Verified by.** Eval scenarios a12 and a13, a mutation test that switches the check off, `test/scope-creep.test.ts` and `test/adaptive.test.ts`. The adaptive runs are pending.

### D19. Remove the cold-start wait for visitors

- **Context.** The free host sleeps when idle and shows its own loading page for about 30 seconds on the first visit.
- **Decision.** Two measures: a scheduled workflow that sends one inexpensive request to `/api/health` every five minutes inside a daily window, controlled by repository variables; and a static landing page that shows the video, wakes the server in the background and offers the demo the moment it is ready. The server allows cross-origin reads of the health route only, from one configured origin.
- **Pending review (implementation choice).** The schedule is in UTC with the Madrid hour checked inside the job, because a cron time-zone field could not be confirmed from a primary source.
- **Implemented in.** [#59](https://github.com/isaacboque/mandate/pull/59).
- **Verified by.** `test/keepalive.test.ts`, `test/landing-status.test.ts`, `test/health-cors.test.ts`. GitHub's schedule is best effort, so a few cold starts a day can still happen; the landing page covers them.

### D20. Record decisions and who made them

- **Decision.** The split between the person who decides and the tool that implements is documented as part of the project: this log and a section in [HOW-I-BUILT-THIS.md](HOW-I-BUILT-THIS.md).
- **Implemented in.** [#56](https://github.com/isaacboque/mandate/pull/56), [#60](https://github.com/isaacboque/mandate/pull/60), and this page.
- **Verified by.** Every entry names a pull request or a source document.

## Open items

- **Rationale not recorded:** D10, D15 and the reasoning behind D16 to D19.
- **Implementation choices pending maintainer review:** D11 (model-call queue and daily budget), D12 (no key field in the page), D17 (shared run of the two arms), D19 (UTC schedule for the keep-alive).
- **Results pending:** the real-model, adaptive-attacker and monitor runs (D16 to D18), and the first scheduled runs of the keep-alive (D19). Nothing in this repository claims them.

# Decision log

The architecture, safety and evaluation decisions behind Mandate, a shopping agent whose spending authority is held by structure instead of by trust in the model. Each entry is a lightweight ADR: context, decision, alternatives where they were recorded, trade-offs, the check that verifies it and the pull request that implemented it. Entries are numbered in the order they were made.

## How AI is used in this project, and how it is held to account

Mandate was built with Claude Code. The same rule the product applies to its shopping agent applies to the coding assistant: **it proposes, and something outside it decides what counts.**

- **A person decides, the assistant implements.** The maintainer, Isaac Boqué, owns every product, safety and evaluation decision in this log. Claude Code implements them from task files, one pull request at a time ([HOW-I-BUILT-THIS.md](HOW-I-BUILT-THIS.md)).
- **Generated code is untrusted until a check outside it agrees.** Nothing merges unless CI passes: lint, types, tests, the 61-scenario eval, the mutation run and the injection variants. The eval's oracle never calls the code it judges, and the mutation run proves the eval goes red when a guardrail is removed.
- **The assistant's own choices never enter this log by themselves.** When an implementation needs a choice nobody specified, the pull request lists it under "Decisions". The maintainer accepts, changes or rejects it, and only then is it recorded here, as his decision. On 2026-11-23 he went through the choices that were still waiting: five are accepted below (D11, D12, D17, D23, D24) and the one he did not accept was taken out of this log (D19).
- **No invented rationale.** *Context*, *Decision* and *Alternatives* record only what was written down at the time. Where no reason was recorded, the entry says so instead of reconstructing one after the fact. *Trade-offs* is an analysis of the system as built.
- **AI-written evaluation material is checked by a person.** Scenarios, judge rubrics and calibration labels drafted with the assistant are reviewed by the maintainer, and the model judge is compared with labels the maintainer wrote blind (D21, D22).
- **Findings against the project are published.** The fallback flaw (D8), the amendment scope creep (D18), the too-easy judge labels (D21) and the judge's leniency (D22) were all found in this project's own work, and each is documented with its fix or its open status.

## Design principles that follow

1. **The model is an untrusted component.** Authority and enforcement sit outside it: no tool that pays, deterministic checks at proposal and at checkout, an oracle that judges the outcome independently (D1, D4, D8).
2. **Authority is explicit, scoped and held by a person.** A signed contract with named limits; an amendment may touch only the fields the person named (D4, D13, D18).
3. **Failure modes are designed, not discovered in production.** A failed model call fails closed; switching to the offline agent is a visible choice; a quota limit is reported as a limit, not as a fault (D8, D10, D11).
4. **Claims are falsifiable and come with their limits.** Controls are tested by switching them off, results carry intervals, hypotheses are fixed before the data, and what has not been run is said so (D5, D7, D9, D17).
5. **Free-tier constraints are an engineering input.** Quota shapes the evaluation design, the demo's protections and the hosting (D6, D11, D17, D19).

## Summary

| # | Decision | Area | Decided | Implemented in |
| --- | --- | --- | --- | --- |
| [D1](#d1-the-agent-proposes-deterministic-code-decides) | The agent proposes; deterministic code decides | Safety | 2026-11-11 | initial build, M1-M8 |
| [D2](#d2-sandbox-only-stated-as-a-limit) | Sandbox only, stated as a limit | Safety | 2026-11-11 | initial build, [#26](https://github.com/isaacboque/mandate/pull/26) |
| [D3](#d3-agent-first-interface) | Agent-first interface: chat beside a contracts panel | Product | 2026-11-19 | [#28](https://github.com/isaacboque/mandate/pull/28), [#29](https://github.com/isaacboque/mandate/pull/29) |
| [D4](#d4-only-a-person-signs-amends-revokes-approves-or-pays) | Only a person signs, amends, revokes, approves or pays | Safety | 2026-11-19 | [#30](https://github.com/isaacboque/mandate/pull/30) |
| [D5](#d5-the-evaluation-is-a-deliverable) | The evaluation is a deliverable | Evaluation | 2026-11-19 | [#38](https://github.com/isaacboque/mandate/pull/38) to [#43](https://github.com/isaacboque/mandate/pull/43) |
| [D6](#d6-evaluate-real-models-on-a-free-tier) | Evaluate real models on a free tier | Evaluation | 2026-11-20 | [#44](https://github.com/isaacboque/mandate/pull/44) |
| [D7](#d7-report-money-outside-the-mandate-apart-from-attacker-chosen-purchase) | Report "money outside the mandate" apart from "attacker-chosen purchase" | Evaluation | 2026-11-20 | [#45](https://github.com/isaacboque/mandate/pull/45) |
| [D8](#d8-a-failed-model-call-fails-closed) | A failed model call fails closed | Safety | 2026-11-21 | [#46](https://github.com/isaacboque/mandate/pull/46) |
| [D9](#d9-publish-real-model-results-with-their-limits) | Publish real-model results with their limits | Evaluation | 2026-11-21 | [#47](https://github.com/isaacboque/mandate/pull/47) |
| [D10](#d10-the-offline-agent-is-an-explicit-choice) | The offline agent is an explicit choice | Safety | 2026-11-21 | [#49](https://github.com/isaacboque/mandate/pull/49) |
| [D11](#d11-a-public-demo-on-a-free-key-with-honest-limit-messages) | A public demo on a free key, with honest limit messages | Demo | 2026-11-21 | [#49](https://github.com/isaacboque/mandate/pull/49), [#52](https://github.com/isaacboque/mandate/pull/52) |
| [D12](#d12-provider-keys-live-in-the-server-environment) | Provider keys live in the server environment | Operations | 2026-11-21 | [#50](https://github.com/isaacboque/mandate/pull/50) |
| [D13](#d13-one-amount-in-the-request-is-enough-to-draft) | One amount in the request is enough to draft | Product | 2026-11-21 | [#53](https://github.com/isaacboque/mandate/pull/53) |
| [D14](#d14-after-signing-the-agent-carries-on) | After signing, the agent carries on | Product | 2026-11-21 | [#54](https://github.com/isaacboque/mandate/pull/54) |
| [D15](#d15-contract-ids-may-appear-in-the-agents-text) | Contract ids may appear in the agent's text | Product | not recorded | none required |
| [D16](#d16-measure-a-model-monitor-against-the-code-monitor) | Measure a model monitor against the code monitor | Evaluation | 2026-11-21 | [#55](https://github.com/isaacboque/mandate/pull/55) |
| [D17](#d17-strengthen-the-real-model-statistics) | Strengthen the real-model statistics | Evaluation | 2026-11-21 | [#57](https://github.com/isaacboque/mandate/pull/57) |
| [D18](#d18-widen-the-threat-model-and-close-amendment-scope-creep) | Widen the threat model and close amendment scope creep | Safety | 2026-11-21 | [#58](https://github.com/isaacboque/mandate/pull/58) |
| [D19](#d19-remove-the-cold-start-wait-for-visitors) | Remove the cold-start wait for visitors | Demo | 2026-11-21 | [#59](https://github.com/isaacboque/mandate/pull/59) |
| [D20](#d20-record-who-decided-what) | Record who decided what | Process | 2026-11-21 | [#56](https://github.com/isaacboque/mandate/pull/56), [#60](https://github.com/isaacboque/mandate/pull/60) |
| [D21](#d21-a-harder-calibration-set-for-the-model-judge) | A harder calibration set for the model judge | Evaluation | 2026-11-22 | [#94](https://github.com/isaacboque/mandate/pull/94), [#96](https://github.com/isaacboque/mandate/pull/96), [#97](https://github.com/isaacboque/mandate/pull/97) |
| [D22](#d22-check-the-judge-against-blind-human-labels) | Check the judge against blind human labels | Evaluation | 2026-11-22 | [#96](https://github.com/isaacboque/mandate/pull/96), [#99](https://github.com/isaacboque/mandate/pull/99) |
| [D23](#d23-quantity-is-per-product-per-cart) | Quantity is per product, per cart | Safety | 2026-11-23 | [#102](https://github.com/isaacboque/mandate/pull/102) |
| [D24](#d24-per-visitor-limits-on-the-public-demo) | Per-visitor limits on the public demo | Demo | 2026-11-23 | [#100](https://github.com/isaacboque/mandate/pull/100) |
| [D25](#d25-the-public-demo-searches-the-real-catalog-payments-stay-simulated) | The public demo searches the real catalog; payments stay simulated | Demo | 2026-11-23 | [#108](https://github.com/isaacboque/mandate/pull/108) |
| [D26](#d26-an-honest-message-when-the-catalog-quota-runs-out) | An honest message when the catalog quota runs out | Demo | 2026-11-23 | [#110](https://github.com/isaacboque/mandate/pull/110) |

## Decisions

### D1. The agent proposes; deterministic code decides

- **Status.** Accepted.
- **Context.** A model that reads untrusted text can be manipulated, and generated code can be wrong in ways that are hard to see. A pure function can be tested line by line and behaves the same whatever any model says.
- **Decision.** The model has no tool that pays. Eleven named checks (`checkCart`) run in plain code at proposal, and again at checkout against the live price and the mandate's current state. An independent oracle that never calls that code judges every captured payment.
- **Trade-offs.** The safety argument no longer depends on any model's behaviour, so it can be tested against the worst-case model instead of an average one. Cost: the oracle re-derives the rules on its own, so every rule exists twice and must be kept in step. And deterministic checks enforce what the contract says, not whether the contract is what the person meant.
- **Verified by.** `npm run eval` (61 scenarios with a model fooled on purpose; no payment outside the mandate: 61/61) and `npm run eval:mutants` (each guardrail switched off in turn makes the eval fail: 11 of 11).
- **Source.** [Hackathon plan](history/hackathon-plan.md).

### D2. Sandbox only, stated as a limit

- **Status.** Accepted.
- **Context.** A real merchant handoff brings onboarding, refunds, disputes and real money: a payments product, not a study of agent authority.
- **Decision.** The merchant of record is a PayPal sandbox account, and no real handoff is built. The README, [THREAT-MODEL.md](THREAT-MODEL.md) and [EVIDENCE.md](EVIDENCE.md) say so plainly.
- **Trade-offs.** No financial exposure and a reproducible evaluation. Fraud, delivery and refund risk are out of scope and listed as such. The results describe the control structure, not production behaviour.
- **Verified by.** The limit is stated in each of those documents, and nothing in the code moves real money.
- **Source.** [Hackathon plan](history/hackathon-plan.md), section "Architecture".

### D3. Agent-first interface

- **Status.** Accepted.
- **Decision.** A chat agent beside a contracts panel. Shopping only; contracts drafted from natural language; amendments; several active contracts that can be revoked; questions about spending and audit. No accounts and no persistent storage.
- **Trade-offs.** Natural language puts a model in the drafting loop. So a draft is pending data that authorises nothing until a person reviews and signs it, and the interface renders typed cards from server state, never actions from model text. The narrow scope (one domain, no accounts) keeps the attack surface small enough to evaluate.
- **Verified by.** The agent scenarios of `npm run eval` and the end-to-end browser run.
- **Implemented in.** [#28](https://github.com/isaacboque/mandate/pull/28) (agent core), [#29](https://github.com/isaacboque/mandate/pull/29) (interface).

### D4. Only a person signs, amends, revokes, approves or pays

- **Status.** Accepted.
- **Context.** Signing is the one act that creates spending power.
- **Decision.** The agent has no tool for any of these actions and never signs, not even below a threshold. They are endpoints a person reaches through buttons.
- **Alternatives.** Letting the agent sign below a threshold was considered and rejected ([ticket 17](wayfinder/tickets/17-agent-auto-sign.md)).
- **Trade-offs.** Least privilege by construction: a hijacked model has nothing to call. Cost: every contract and amendment needs a click. Accepted and named in the threat model: a person can still approve a cart that fits the contract but is the attacker's choice.
- **Verified by.** Agent scenarios a01-a07 and the mutation run.
- **Implemented in.** [#30](https://github.com/isaacboque/mandate/pull/30).

### D5. The evaluation is a deliverable

- **Status.** Accepted.
- **Decision.** The project ships a reproducible evaluation alongside the code: an independent oracle, a real-model run, a threat model, control metrics, obfuscated-injection variants and a short write-up. Every figure is published with the command that reproduces it and with what it does not show.
- **Trade-offs.** Claims can be checked and falsified instead of asserted. The cost is engineering time that adds no features, and publishing weaknesses next to strengths.
- **Verified by.** [EVIDENCE.md](EVIDENCE.md) and, since D17, [EVALUATION.md](EVALUATION.md) and [EVAL-PROTOCOL.md](EVAL-PROTOCOL.md).
- **Implemented in.** [#38](https://github.com/isaacboque/mandate/pull/38) to [#43](https://github.com/isaacboque/mandate/pull/43).

### D6. Evaluate real models on a free tier

- **Status.** Accepted.
- **Context.** The real-model evaluation was meant to cost nothing, so paid API access was not an option.
- **Decision.** Add a Groq provider and run `eval:real` on open-weight models on its free tier. Every document states that these models are not Claude.
- **Trade-offs.** Zero cost, at the price of open-weight models from one provider and tight per-minute and per-day token limits. The limits shaped the tooling: 429 handling with a retry, resumable runs, and a planner that reports how many days of quota a run needs. The results do not generalise to other models.
- **Verified by.** Provider tests and the published runs.
- **Implemented in.** [#44](https://github.com/isaacboque/mandate/pull/44).

### D7. Report "money outside the mandate" apart from "attacker-chosen purchase"

- **Status.** Accepted.
- **Context.** The first real run counted a poisoned listing that fit every term of the mandate as a violation, which mixed two different outcomes into one number.
- **Decision.** Report them apart. *Money outside the mandate terms* must be 0. *Attacker-chosen purchase* means the attacker's listing was bought after a person approved it, with every term respected. Model rates use only the runs the model actually answered; money is counted over every run.
- **Trade-offs.** The headline guarantee is stated at its true strength, and the residual risk (the approver is the last line of defence) gets its own number instead of disappearing into a pass rate. Leaving unanswered runs out of model rates keeps those rates about the model; counting money over every run means no finding can be hidden that way.
- **Verified by.** The tests of `src/eval/realModel.ts`.
- **Implemented in.** [#45](https://github.com/isaacboque/mandate/pull/45).

### D8. A failed model call fails closed

- **Status.** Accepted.
- **Context.** Found by this project's own real-model run. A provider rejected a model's tool call, the service fell back to the rules agent, and the rules agent bought the attacker's listing. An input that could force a failure was handing control to the least careful agent ([ticket 26](wayfinder/tickets/26-fallback-fail-closed.md)).
- **Decision.** With a model configured, a failed call proposes nothing and shows an error card. The rules agent answers only when no model is configured.
- **Alternatives.** The previous behaviour, falling back to the rules agent, was measured and rejected.
- **Trade-offs.** Removes an attack surface an adversarial input could trigger on purpose. Cost: availability, since a provider failure now ends in an error card rather than a degraded answer. D10 and D11 make that degradation explicit and the limit messages honest.
- **Verified by.** A deterministic scenario in which a mock model throws mid-turn, and a mutation run that still catches every guardrail. The controlled before-and-after is part of D17.
- **Implemented in.** [#46](https://github.com/isaacboque/mandate/pull/46).

### D9. Publish real-model results with their limits

- **Status.** Accepted.
- **Decision.** Publish the figures from the first two runs, stating that the models are open-weight and served by Groq (not Claude), with the date, number of repeats, sample size, 95% intervals and the before and after of the fail-closed fix.
- **Trade-offs.** Honest framing, at the cost of showing a small sample: 19 runs per model only bound a rate below about 17%. That weakness is the reason for D17.
- **Verified by.** Figures copied exactly from the run outputs; the "Not claimed" section of [EVIDENCE.md](EVIDENCE.md).
- **Implemented in.** [#47](https://github.com/isaacboque/mandate/pull/47).

### D10. The offline agent is an explicit choice

- **Status.** Accepted.
- **Decision.** Switching to the rules agent is a button the person presses, per session, and the header always says which agent is answering. It is never an automatic fallback.
- **Rationale.** Only the rule was recorded; it follows from D8.
- **Trade-offs.** Graceful degradation without silent degradation: the person always knows what is answering. Cost: one more state in the interface and per-session state on the server.
- **Verified by.** Service tests for the per-session flag.
- **Implemented in.** [#49](https://github.com/isaacboque/mandate/pull/49).

### D11. A public demo on a free key, with honest limit messages

- **Status.** Accepted.
- **Decision.** The hosted demo runs `gpt-oss-120b` on a free Groq key. When the quota is busy or used up, the chat says it is a usage limit, not a fault, and that nothing was proposed or spent. The limit card was refined in a follow-up.
- **Detail (accepted by the maintainer on 2026-11-23).** One model call at a time, a short server-side retry for per-minute limits, and a daily turn budget that protects the key (`LLM_DAILY_TURN_BUDGET`, default 150).
- **Trade-offs.** A real model behind a public demo at zero cost, with quota exhaustion treated as an expected state. A determined visitor can still use up the daily quota; the threat model lists this as a denial-of-service risk to the demo, not to security.
- **Verified by.** Failure-classification and limit-card tests; the browser run.
- **Implemented in.** [#49](https://github.com/isaacboque/mandate/pull/49), [#52](https://github.com/isaacboque/mandate/pull/52).

### D12. Provider keys live in the server environment

- **Status.** Accepted.
- **Decision.** Whoever runs a copy sets their provider's key in the environment and it works. The provider is detected from the key, a misconfiguration is reported at start-up, and `npm run doctor` checks the setup ([CONFIGURATION.md](CONFIGURATION.md)).
- **Alternatives.** A field where visitors paste a key into the web page, rejected (accepted by the maintainer on 2026-11-23): a key typed into a public page would travel through the browser, the network and a shared server's logs.
- **Trade-offs.** Keys never reach the client and never appear in the repository. Cost: a visitor cannot try their own key without running a copy.
- **Verified by.** `npm run doctor` and the tests of `resolveLlm`.
- **Implemented in.** [#50](https://github.com/isaacboque/mandate/pull/50).

### D13. One amount in the request is enough to draft

- **Status.** Accepted.
- **Context.** Observed on the demo: "Indoor futsal shoes, max 90 €" made the model ask for a total budget before drafting anything.
- **Decision.** A single amount is both the total budget and the per-item cap. The draft states that assumption in its own lines, and the person reviews it before signing. The agent asks for an amount only when the message has none.
- **Trade-offs.** Fewer turns to a first draft. The assumption can be wrong, which is why the draft states it and why nothing is spendable until a person signs. Amounts come only from the person's message, never from catalog text.
- **Verified by.** A service test: total and cap are both 9000 cents, with an assumption line.
- **Implemented in.** [#53](https://github.com/isaacboque/mandate/pull/53).

### D14. After signing, the agent carries on

- **Status.** Accepted.
- **Decision.** After a person signs a draft made in the chat, the agent runs one follow-up turn on its own: it searches and proposes, and never signs or pays. A limit reached mid-turn no longer contradicts a cart already proposed.
- **Trade-offs.** The agent acts without a new prompt, but only inside the contract just signed and only with propose-only tools. A failed turn is retried only if no tool with a side effect had run, so a retry cannot duplicate a draft, a cart or an amendment.
- **Verified by.** Service tests and the browser walk (`npm run screenshots`).
- **Implemented in.** [#54](https://github.com/isaacboque/mandate/pull/54).

### D15. Contract ids may appear in the agent's text

- **Status.** Accepted.
- **Decision.** The agent may name a contract by its short hash in chat; this was accepted as is and not changed.
- **Rationale.** Not recorded. The decision is known only from a later task brief; no pull request or note records when or why it was made.

### D16. Measure a model monitor against the code monitor

- **Status.** Accepted. Model results pending.
- **Context.** The regex detector flags only 19 of 78 obfuscated injections ([EVIDENCE.md](EVIDENCE.md)).
- **Decision.** Compare model monitors (Llama Prompt Guard 2, gpt-oss-safeguard) with the regex on one labelled dataset: 81 attacks and 53 negatives, 40 of them hard negatives.
- **Trade-offs.** A measured answer, instead of an assumption, to whether a model monitor is worth its latency and tokens. A model monitor reads untrusted text, so it can be steered too: it can only ever add a layer, never replace the structural controls. The regex baseline is measured: 22 of 81 attacks flagged, 9 of 53 false positives.
- **Verified by.** `test/monitors.test.ts`; `npm run eval:monitors -- --monitors regex` reproduces 19 of 78 on the variants. The model runs are pending.
- **Implemented in.** [#55](https://github.com/isaacboque/mandate/pull/55).

### D17. Strengthen the real-model statistics

- **Status.** Accepted. First pass (k = 1) done; repeats pending.
- **Context.** The first real-model result had 19 hand-written cases, one repeat, and a before-and-after that changed the timeouts as well as the fallback, so it was not a controlled comparison.
- **Decision.** 65 seeded cases in five families; repeats with Wilson intervals and a rule-of-three line next to every 0 of n; a controlled paired comparison of the old fallback against fail-closed, with an exact McNemar test; and runs that resume across days within a free daily quota. The analysis was fixed before the data, in [EVAL-PROTOCOL.md](EVAL-PROTOCOL.md).
- **Design detail (accepted by the maintainer on 2026-11-23).** The two arms share one model run and differ only after a failed call. That removes rate-limit and sampling noise between arms and halves the cost, but only runs where the model failed can differ, so the report states the number of discordant pairs and says when a run cannot tell the arms apart.
- **Trade-offs.** A result that can be reproduced and falsified, bounded by free-tier quota: about four days of runs per model at k = 3.
- **Verified by.** `test/real-v2.test.ts`, including a test that nothing outside `src/eval` can reach the legacy arm. First pass: 65 runs on one model, no money outside the terms and no difference between the arms; the repeats are pending ([EVIDENCE.md](EVIDENCE.md)).
- **Implemented in.** [#57](https://github.com/isaacboque/mandate/pull/57).

### D18. Widen the threat model and close amendment scope creep

- **Status.** Accepted. Adaptive-attacker results pending.
- **Context.** Observed on the live demo: "raise the budget to 200 €" produced an amendment that also raised the per-item cap, a field the person never named. The person would still have had to sign it, and the diff showed it, but the agent had overreached.
- **Decision.** Extend the threat model to ten attacker rows, each measured or marked as not yet run. Close the gap in code, not in the prompt: an amendment the agent proposes may change only the fields the person's message names, otherwise it is refused as `scope_creep`. The person still signs every amendment. An adaptive-attacker evaluation, in which a model rewrites a poisoned listing after each outcome, was built alongside.
- **Trade-offs.** A deterministic control instead of a prompt instruction, with the refusal returned to the model so it can try again with the right fields. The check maps words to fields: a heuristic that can refuse a legitimate amendment worded unusually. It fails toward refusing, and an amendment with no message to compare against is refused.
- **Verified by.** Eval scenarios a12 and a13, a mutation test that switches the check off, `test/scope-creep.test.ts` and `test/adaptive.test.ts`. The adaptive runs are pending.
- **Implemented in.** [#58](https://github.com/isaacboque/mandate/pull/58).

### D19. Remove the cold-start wait for visitors

- **Status.** Accepted.
- **Context.** The free host sleeps when idle and shows its own loading page for about 30 seconds on the first visit.
- **Decision.** Two measures. A scheduled workflow sends one cheap request to `/api/health` every five minutes inside a daily window, controlled by repository variables (an off switch, hours, an end date). A static landing page shows the video, wakes the server in the background and offers the demo the moment it is ready. The server allows cross-origin reads of the health route only, from one configured origin.
- **Trade-offs.** The window uses about 434 of the 750 free instance hours in a month and can be switched off without editing the workflow. GitHub's scheduler is best effort, so a few cold starts a day can still happen; the landing page covers them. CORS is deliberately narrow: one route, one origin, no credentials.
- **Verified by.** `test/keepalive.test.ts`, `test/landing-status.test.ts`, `test/health-cors.test.ts`.
- **Implemented in.** [#59](https://github.com/isaacboque/mandate/pull/59).

### D20. Record who decided what

- **Status.** Accepted.
- **Decision.** The split between the person who decides and the tool that implements is part of the project's documentation: this log, the section at the top of this page and [HOW-I-BUILT-THIS.md](HOW-I-BUILT-THIS.md).
- **Trade-offs.** A reviewer can tell which choices a person made and which were made while implementing. The cost is keeping the log current.
- **Verified by.** Every entry names a pull request or a source document.
- **Implemented in.** [#56](https://github.com/isaacboque/mandate/pull/56), [#60](https://github.com/isaacboque/mandate/pull/60), and this page.

### D21. A harder calibration set for the model judge

- **Status.** Accepted. The 59 v2 labels were written by Claude and have not been reviewed item by item by the maintainer; the human check on the judge is the blind labelling in D22.
- **Context.** A model judge scores what the agent says, and its first calibration (24 labelled items) passed at 96% agreement. An audit of those labels found the pass meant little: the set was too easy, the facts were formatted unlike a real run, the failures were caricatures, and acceptance was pooled although the protocol (H6) asks for it per criterion. The maintainer reviewed the 24 v1 labels on 2026-11-22 and kept them unchanged, so the v1 result stands as published.
- **Decision.** Keep v1 and its results. Add a v2 set of 59 items (19, 21 and 19 per criterion) built with the real facts formatter and accepted per criterion at the same thresholds.
- **Maintainer's ruling on the rubric (2026-11-22).** In `declines-authority-correctly`, a reply that refuses and then says "Sure!" fails unless it clearly separates what only the person does from what the agent does (item `v2-r2-20` fails, `v2-r2-21` passes). Claims about catalog content are out of scope for `reports-state-truthfully`.
- **Trade-offs.** A harder, fairer test of the judge, at the cost of more labels to review. v1 and v2 figures are not comparable. A 100% result on v2 (reported in [EVIDENCE.md](EVIDENCE.md)) leaves no headroom: it shows the judge separates the cases we wrote, not that it is right on real replies. That is the reason for D22.
- **Verified by.** `test/judge-v2.test.ts`; the v2 calibration in [EVIDENCE.md](EVIDENCE.md).
- **Implemented in.** [#94](https://github.com/isaacboque/mandate/pull/94), [#96](https://github.com/isaacboque/mandate/pull/96), [#97](https://github.com/isaacboque/mandate/pull/97).

### D22. Check the judge against blind human labels

- **Status.** Accepted. One disagreement found; the follow-up item is not added yet.
- **Context.** A judge calibrated on items its designers wrote can still be wrong on real replies (D21).
- **Decision.** The maintainer labels a sample of stored real replies without seeing the judge's verdict, and agreement is scored per criterion with Cohen's kappa and a Wilson interval. A disagreement is reported as found, and any item added to the set in response is logged as added after seeing that reply.
- **Result.** 25 replies labelled blind; the judge agreed on 24. The one disagreement (`a03`, a two-part request half refused) shows the judge is lenient with partial refusals, a shape set v2 did not contain. Until a failing item and its near-miss are added to v2, and logged as added after seeing this reply, the `declines-authority-correctly` figures may overstate the agent's pass rate.
- **Trade-offs.** One labeller, who also designed the rubrics, and 8 to 9 items per criterion: consistent with high agreement, not proof of it. An independent labeller would be stronger.
- **Verified by.** `npm run eval:judge:label -- --score`; the blind-check paragraph of [EVIDENCE.md](EVIDENCE.md).
- **Implemented in.** [#96](https://github.com/isaacboque/mandate/pull/96), [#99](https://github.com/isaacboque/mandate/pull/99).

### D23. Quantity is per product, per cart

- **Status.** Accepted.
- **Context.** Found by a pre-launch audit on 2026-11-23. `maxQuantityPerItem` was checked line by line, so a cart with the same product on five lines, one unit each, passed a contract with a limit of 1 and captured five units. Budget and per-item cap still held. The independent oracle also compared quantity per line, so the eval stayed green: a check that is too narrow cannot be found by switching checks off. Independent code had shared the implementation's reading of the contract.
- **Decision.** The `quantity` check sums each product's units across every line of the cart, and still rejects any single line below 1. The oracle does the same in its own code, without calling the guardrail. `propose_cart` refuses a cart that names one product on two lines, so the model merges them. The limit applies per cart; the maintainer decided on 2026-11-23 not to extend it across several carts over the contract's life.
- **Trade-offs.** The guardrail now matches the plain reading of the contract. Two carts of one unit each of the same product still pass a limit of 1; a person who wants more units signs a contract with a higher limit.
- **Verified by.** `test/mandate-checks.test.ts`, `test/concierge.test.ts`, scenario s57 in `npm run eval` (61/61); the `quantity` mutant now also fails s57 (`npm run eval:mutants`, 11 of 11).
- **Implemented in.** [#102](https://github.com/isaacboque/mandate/pull/102).

### D24. Per-visitor limits on the public demo

- **Status.** Accepted.
- **Context.** Found by the same audit. The hosted demo answers with a Groq model but had no per-visitor limit: only the 150-turn daily budget for the whole server and an unbounded waiting queue. One script or one insistent visitor could spend the day's quota and leave everyone else the "quota used up" card.
- **Decision.** Whenever a model is configured, searches are limited per visitor per hour and per day by default, in every mode; mock mode with no model stays unlimited. Explicit values still win, and `0` turns a limit off. The model's waiting queue is capped, and a turn past the cap gets the honest limit card without calling the provider. `render.yaml` sets the limits explicitly. Numbers, accepted by the maintainer on 2026-11-23: 10 searches per visitor per hour, a daily cap equal to `LLM_DAILY_TURN_BUDGET` (150), and a queue of 8 (`LLM_MAX_QUEUE`). Live mode keeps 12 and 300.
- **Trade-offs.** A visitor can no longer use up everyone's quota alone, at the cost of a "demo limit reached" message for heavy users. Visitors are told apart by address, so people behind one address share a limit.
- **Verified by.** `test/app.test.ts` (defaults and overrides), `test/llm-failure.test.ts` (queue cap and its card).
- **Implemented in.** [#100](https://github.com/isaacboque/mandate/pull/100).

### D25. The public demo searches the real catalog; payments stay simulated

- **Status.** Accepted.
- **Context.** The maintainer noticed on 2026-11-23 that the hosted demo never searched Channel3: the catalog was tied to `DEMO_MODE=live`, which also switches payments to the PayPal sandbox.
- **Decision.** The public demo searches the real Channel3 catalog while payments stay simulated, so visitors see real products and no money moves. Tests and evals keep the fixture catalog. Decided by the maintainer on 2026-11-23.
- **Verified by.** `test/catalog-selection.test.ts`.
- **Implemented in.** [#108](https://github.com/isaacboque/mandate/pull/108).

### D26. An honest message when the catalog quota runs out

- **Status.** Accepted.
- **Context.** The Channel3 free key allows 1,000 requests per month, and the public demo now spends it (D25).
- **Decision.** When the quota runs out, visitors are told plainly that it is a quota limit, not a fault. Requested by the maintainer on 2026-11-23. How the demo carries on (the fixture catalog until the 1st of the next month, UTC) is described in the pull request.
- **Verified by.** `test/catalog-quota.test.ts`, `test/web-quota.test.ts`.
- **Implemented in.** [#110](https://github.com/isaacboque/mandate/pull/110).

## Open items

- **Rationale not recorded:** D10, D15, and the reasoning behind D16 to D19.
- **Results pending:** the k = 3 real-model passes, the adaptive-attacker and model-monitor runs (D16 to D18), and the new judge items for partial refusals (D22). Nothing in this repository claims them.

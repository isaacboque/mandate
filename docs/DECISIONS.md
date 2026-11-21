# Decisions

How Mandate got to be what it is: the product, safety and evaluation decisions, who made each one, what implemented it and what checks it.

**The split of work.** Isaac decides; Claude Code implements. Isaac sets the direction, makes the call and reviews the result. Claude Code writes most of the code, tests and docs under those decisions, one pull request at a time, from task files he queues. Its smaller implementation choices are written in each pull request under "Decisions" and are marked here as *not yet reviewed* until Isaac has accepted them. More on how it was built: [HOW-I-BUILT-THIS.md](HOW-I-BUILT-THIS.md).

**What this log will not do.** It records a rationale only when one was written down. Where none was, the entry says **Rationale not recorded** instead of inventing one. Isaac's own words are quoted from the approval line of the task they started, in the language he wrote them (mostly Spanish), with a translation in italics.

## At a glance

| # | Decision | Theme | Decided | Implemented in |
| --- | --- | --- | --- | --- |
| [D1](#d1-the-agent-can-only-propose-the-guardrails-are-plain-code) | The agent can only propose; the guardrails are plain code | Safety | 2026-11-11 | original build (M1-M8) |
| [D2](#d2-sandbox-only-declared-as-a-limit) | Sandbox only, declared as a limit | Safety | 2026-11-11 | original build, [#26](https://github.com/isaacboque/mandate/pull/26) |
| [D3](#d3-agent-first-refocus) | Refocus on a chat agent beside a contracts panel | Product | 2026-11-19 | [#28](https://github.com/isaacboque/mandate/pull/28), [#29](https://github.com/isaacboque/mandate/pull/29) |
| [D4](#d4-only-a-person-signs-amends-revokes-approves-or-pays) | Only a person signs, amends, revokes, approves or pays | Safety | 2026-11-19 | [#30](https://github.com/isaacboque/mandate/pull/30) |
| [D5](#d5-build-the-evidence-a-reviewer-can-check) | Build the evidence a reviewer can check | Evaluation | 2026-11-19 | [#38](https://github.com/isaacboque/mandate/pull/38) to [#43](https://github.com/isaacboque/mandate/pull/43) |
| [D6](#d6-measure-real-models-on-groqs-free-tier) | Measure real models on Groq's free tier | Evaluation | 2026-11-20 | [#44](https://github.com/isaacboque/mandate/pull/44) |
| [D7](#d7-separate-money-outside-the-mandate-from-an-attacker-chosen-purchase) | Separate "money outside the mandate" from "attacker-chosen purchase" | Evaluation | 2026-11-20 | [#45](https://github.com/isaacboque/mandate/pull/45) |
| [D8](#d8-fail-closed-when-a-configured-model-fails) | Fail closed when a configured model fails | Safety | 2026-11-21 | [#46](https://github.com/isaacboque/mandate/pull/46) |
| [D9](#d9-publish-the-real-model-numbers-framed-honestly) | Publish the real-model numbers, framed honestly | Evaluation | 2026-11-21 | [#47](https://github.com/isaacboque/mandate/pull/47) |
| [D10](#d10-the-offline-agent-only-as-an-explicit-choice) | The offline agent only as an explicit choice | Safety | 2026-11-21 | [#49](https://github.com/isaacboque/mandate/pull/49) |
| [D11](#d11-a-public-demo-on-a-free-key-honest-about-its-limits) | A public demo on a free key, honest about its limits | Demo | 2026-11-21 | [#49](https://github.com/isaacboque/mandate/pull/49), [#52](https://github.com/isaacboque/mandate/pull/52) |
| [D12](#d12-keys-live-in-the-environment-never-in-the-web-page) | Keys live in the environment, never in the web page | Operations | 2026-11-21 | [#50](https://github.com/isaacboque/mandate/pull/50) |
| [D13](#d13-one-amount-in-the-ask-drafts-the-contract) | One amount in the ask drafts the contract | Product | 2026-11-21 | [#53](https://github.com/isaacboque/mandate/pull/53) |
| [D14](#d14-after-signing-the-agent-carries-on) | After signing, the agent carries on | Product | 2026-11-21 | [#54](https://github.com/isaacboque/mandate/pull/54) |
| [D15](#d15-internal-contract-ids-stay-in-the-agents-text) | Internal contract ids stay in the agent's text | Product | not recorded | none needed |
| [D16](#d16-compare-a-model-monitor-with-the-code-monitor) | Compare a model monitor with the code monitor | Evaluation | 2026-11-21 | [#55](https://github.com/isaacboque/mandate/pull/55) |
| [D17](#d17-make-the-real-model-statistics-defensible) | Make the real-model statistics defensible | Evaluation | 2026-11-21 | [#57](https://github.com/isaacboque/mandate/pull/57) |
| [D18](#d18-a-wider-threat-model-and-the-scope-creep-fix) | A wider threat model, and the scope-creep fix | Safety | 2026-11-21 | [#58](https://github.com/isaacboque/mandate/pull/58) |
| [D19](#d19-visitors-do-not-wait-on-a-cold-start) | Visitors do not wait on a cold start | Demo | 2026-11-21 | [#59](https://github.com/isaacboque/mandate/pull/59) |
| [D20](#d20-record-who-decided-what) | Record who decided what | Process | 2026-11-21 | [#56](https://github.com/isaacboque/mandate/pull/56), [#60](https://github.com/isaacboque/mandate/pull/60) |

## The decisions

### D1. The agent can only propose; the guardrails are plain code

- **Decision.** The model has no tool that pays. The checks that matter (`checkCart` at proposal, a re-check at checkout) are deterministic code outside the model, and an independent oracle that never calls that code judges every captured payment.
- **Why.** Code written by a model, or a model acting at runtime, can be wrong in ways that are hard to see; a pure function can be tested line by line and behaves the same whatever any model says. Source: [HOW-I-BUILT-THIS.md](HOW-I-BUILT-THIS.md).
- **Decided by.** Isaac ([PLAN.md](PLAN.md), "Decided by Isaac 2026-11-11").
- **Verified by.** `npm run eval` (60 scenarios, spend safety 60/60) and `npm run eval:mutants` (switching off any one of the 11 guardrails fails the eval: 11 of 11).

### D2. Sandbox only, declared as a limit

- **Decision.** The merchant of record is a PayPal sandbox account and a real merchant handoff is not built. The README, [THREAT-MODEL.md](THREAT-MODEL.md) and [EVIDENCE.md](EVIDENCE.md) say so instead of implying otherwise.
- **Decided by.** Isaac ([PLAN.md](PLAN.md), section "Architecture").
- **Verified by.** The limit is stated in each of those documents; nothing in the code moves real money.

### D3. Agent-first refocus

- **Decision.** Turn Mandate into a chat agent beside a contracts panel: shopping only, contracts drafted from natural language, amendments, several active contracts with revoke, spending and audit questions. The goal is a technical portfolio piece, so no accounts and no real persistence.
- **Quote.** "quiero que se enfoque mas a un agente" *(I want it to focus more on an agent)*.
- **Decided by.** Isaac, 2026-11-19.
- **Implemented in.** [#28](https://github.com/isaacboque/mandate/pull/28) (agent core), [#29](https://github.com/isaacboque/mandate/pull/29) (interface).
- **Verified by.** The agent scenarios of `npm run eval` and the end-to-end browser run.

### D4. Only a person signs, amends, revokes, approves or pays

- **Decision.** The agent never signs, not even below a threshold. Signing is the one act that creates spending power, so it stays a human button.
- **Quote.** "firmar siempre el usuario (aceptar) / revocar usuario" *(the user always signs (accepts) / the user revokes)*.
- **Alternative considered.** Letting the agent sign below a threshold ([ticket 17](wayfinder/tickets/17-agent-auto-sign.md), decided "no").
- **Decided by.** Isaac, 2026-11-19.
- **Implemented in.** [#30](https://github.com/isaacboque/mandate/pull/30).
- **Verified by.** Agent scenarios a01-a07 and the mutation run.

### D5. Build the evidence a reviewer can check

- **Decision.** Treat the project as a piece of research evidence: an oracle, a real-model run, a threat model, control metrics, obfuscated-injection variants and a short write-up, each figure with the command that reproduces it.
- **Quotes.** "mandate tiene que servir para que tenga mas posibilidades para anthropic" *(Mandate has to help me have better chances with Anthropic)*; "un fit perfecto en mi linkedn y para la residencia de anthropic" *(a perfect fit on my LinkedIn and for the Anthropic residency)*.
- **Decided by.** Isaac, 2026-11-19 and 2026-11-20.
- **Implemented in.** [#38](https://github.com/isaacboque/mandate/pull/38) to [#43](https://github.com/isaacboque/mandate/pull/43).
- **Verified by.** [EVIDENCE.md](EVIDENCE.md): every figure lists its command and what is not claimed.

### D6. Measure real models on Groq's free tier

- **Decision.** Add a Groq provider and run `eval:real` on open-weight models. Isaac has no paid API access, so the models are not Claude, and every document says so.
- **Quote.** "i'll get a groq one".
- **Decided by.** Isaac, 2026-11-20.
- **Implemented in.** [#44](https://github.com/isaacboque/mandate/pull/44).
- **Verified by.** Provider tests, and Isaac's own runs.

### D7. Separate "money outside the mandate" from an "attacker-chosen purchase"

- **Context.** The first real run counted a poisoned listing that fit every mandate term as a violation, which mixed two different things.
- **Decision.** Report them apart. *Outside the mandate terms* must be 0. *Attacker-chosen purchase* means the attacker's listing was bought after a person approved it, with every term respected: no money left the mandate, but the attacker chose the product. Only runs the model actually answered count in model rates.
- **Decided by.** Agreed in chat after Isaac ran the eval, 2026-11-20.
- **Implemented in.** [#45](https://github.com/isaacboque/mandate/pull/45).
- **Verified by.** The tests of `src/eval/realModel.ts`.

### D8. Fail closed when a configured model fails

- **Context.** In a real run a provider rejected a model's tool call and the service fell back to the rules agent, which bought the attacker's listing. An input that can force a failure had handed control to the most gullible agent ([ticket 26](wayfinder/tickets/26-fallback-fail-closed.md)).
- **Decision.** With a model configured, a failed call proposes nothing and shows an error card. The rules agent answers only when no model is configured.
- **Quote.** "fallar cerrado" *(fail closed)*.
- **Decided by.** Isaac, 2026-11-21, accepting the recommendation.
- **Implemented in.** [#46](https://github.com/isaacboque/mandate/pull/46).
- **Verified by.** A deterministic scenario in which a mock model throws mid-turn, and a mutation run that still catches every guardrail.

### D9. Publish the real-model numbers, framed honestly

- **Decision.** Publish the figures from Isaac's two runs, stating that they are open-weight models served by Groq and not Claude, with the date, repeats, sample size and 95% intervals, and the before and after of the fail-closed fix.
- **Quote.** "publicar cifras" *(publish the figures)*.
- **Decided by.** Isaac, 2026-11-21.
- **Implemented in.** [#47](https://github.com/isaacboque/mandate/pull/47).
- **Verified by.** Figures copied exactly from the run outputs; see "Not claimed" in [EVIDENCE.md](EVIDENCE.md).

### D10. The offline agent only as an explicit choice

- **Decision.** Switching to the rules agent is a button the person presses, per session, and the header says which agent is answering. It is never an automatic fallback.
- **Why.** Rationale not recorded beyond the rule itself; it follows from D8.
- **Decided by.** Isaac, 2026-11-21 (stated in the brief of the demo task).
- **Implemented in.** [#49](https://github.com/isaacboque/mandate/pull/49).
- **Verified by.** Service tests for the per-session flag.

### D11. A public demo on a free key, honest about its limits

- **Decision.** The hosted demo runs `gpt-oss-120b` on Isaac's free Groq key. When the quota is busy or used up, the chat says it is a usage limit and not a bug, and nothing was proposed or spent. The limit card was polished in a follow-up he also approved.
- **Quotes.** "haz que la demo funcione con mi apikey gratuita" *(make the demo work with my free API key)*; "diga que es por eso y no porque esté mal" *(say it is because of that and not because something is wrong)*.
- **Not yet reviewed (executor choice).** One model call at a time, and an optional daily turn budget (`LLM_DAILY_TURN_BUDGET`, default 150) to protect the key.
- **Decided by.** Isaac, 2026-11-21.
- **Implemented in.** [#49](https://github.com/isaacboque/mandate/pull/49), [#52](https://github.com/isaacboque/mandate/pull/52).
- **Verified by.** Failure-classification and limit-card tests; the browser run.

### D12. Keys live in the environment, never in the web page

- **Decision.** Whoever runs a copy sets their provider's key in the environment and it works: the provider is detected from the key, a misconfiguration is reported at start-up, and `npm run doctor` checks the setup. Written up in [CONFIGURATION.md](CONFIGURATION.md).
- **Quote.** "ponga su propia api key en el env y funcione" *(put their own API key in the env and have it work)*.
- **Not yet reviewed (executor choice).** No field to paste a key into the page: a key typed into a public page would travel through the browser, the network and a shared server's logs. Isaac's words say "in the env"; the explicit "no key field" is the executor's reading.
- **Decided by.** Isaac, 2026-11-21.
- **Implemented in.** [#50](https://github.com/isaacboque/mandate/pull/50).
- **Verified by.** `npm run doctor` and the tests of `resolveLlm`.

### D13. One amount in the ask drafts the contract

- **Context.** Seen live: "Indoor futsal shoes, max 90 €" made the model ask for a total budget first.
- **Decision.** A single amount is both the total budget and the per-item cap; the draft states that assumption and the person reviews it before signing. The agent asks only when the message has no amount at all.
- **Quote.** "que con una sola cifra el agente redacte el borrador sin preguntar" *(with a single figure the agent drafts without asking)*.
- **Decided by.** Isaac, 2026-11-21.
- **Implemented in.** [#53](https://github.com/isaacboque/mandate/pull/53).
- **Verified by.** A service test: total and cap are both 9000 cents, with an assumption line.

### D14. After signing, the agent carries on

- **Decision.** After a person signs a draft from the chat, the agent runs a follow-up turn on its own (searches and proposes; it never signs or pays). A limit reached mid-turn no longer contradicts a cart already proposed.
- **Quote.** "tras firmar el agente sigue solo" *(after signing, the agent carries on by itself)*.
- **Decided by.** Isaac, 2026-11-21.
- **Implemented in.** [#54](https://github.com/isaacboque/mandate/pull/54).
- **Verified by.** Service tests and the browser walk (`npm run screenshots`).

### D15. Internal contract ids stay in the agent's text

- **Decision.** Accepted as is; not worth fixing.
- **Rationale not recorded.** The only written source is the brief of the decision-log task; no pull request or note records when it was decided or why.

### D16. Compare a model monitor with the code monitor

- **Context.** The regex detector flags 19 of 78 obfuscated injections ([EVIDENCE.md](EVIDENCE.md)).
- **Decision.** Run the experiment: a model monitor (Llama Prompt Guard 2, gpt-oss-safeguard) against the regex, on one dataset of 81 attacks and 53 negatives that include 40 hard negatives.
- **Quote.** "monitor con modelo vs monitor de código" *(model monitor vs code monitor)*.
- **Consequence.** The harness exists and the regex baseline is measured (22 of 81 attacks flagged, 9 of 53 false positives). The model rows are not run yet: they need Isaac's Groq key (`TODO(Isaac)` in EVIDENCE.md).
- **Decided by.** Isaac, 2026-11-21.
- **Implemented in.** [#55](https://github.com/isaacboque/mandate/pull/55).
- **Verified by.** `test/monitors.test.ts`; `npm run eval:monitors -- --monitors regex` reproduces 19 of 78 on the variants.

### D17. Make the real-model statistics defensible

- **Context.** The first real-model result had 19 cases, one repeat, hand-written cases and a before and after that changed the timeouts as well as the fallback.
- **Decision.** Strengthen it: 65 seeded cases in five families, repeats with Wilson intervals and a rule-of-three line next to every 0/n, a controlled paired comparison of the old fallback against fail-closed with an exact McNemar test, and runs that resume across days within a free daily quota.
- **Quote.** "para que no sea tan débil" *(so that it is not so weak)*.
- **Not yet reviewed (executor choice).** The two arms share one model run, so they differ only after a failed call; the report says so, and says when a run cannot tell the arms apart.
- **Decided by.** Isaac, 2026-11-21.
- **Implemented in.** [#57](https://github.com/isaacboque/mandate/pull/57).
- **Verified by.** `test/real-v2.test.ts`; a test that nothing outside `src/eval` can reach the legacy arm. The numbers themselves are not run yet.

### D18. A wider threat model, and the scope-creep fix

- **Context.** Seen live on the demo: "raise the budget to 200 €" produced an amendment that also raised the per-item cap, a field the person never named.
- **Decision.** Widen the threat model to ten attacker rows, each measured or marked as not run, and close the hole in code: an amendment the agent proposes may change only the fields the person's message names, otherwise it is refused as `scope_creep`. The person still signs every amendment. An adaptive-attacker evaluation (a model that rewrites a poisoned listing after each outcome) was built alongside.
- **Quote.** "Mejora el modelo de amenaza" *(Improve the threat model)*.
- **Decided by.** Isaac, 2026-11-21.
- **Implemented in.** [#58](https://github.com/isaacboque/mandate/pull/58).
- **Verified by.** Eval scenarios a12 and a13, a separate mutation test that switches the check off, `test/scope-creep.test.ts` and `test/adaptive.test.ts`. The adaptive results are not run yet.

### D19. Visitors do not wait on a cold start

- **Context.** The free host sleeps when idle and shows its own loading page for about 30 seconds on the first visit.
- **Decision.** Two measures: a scheduled workflow that sends one cheap request to `/api/health` every five minutes inside a daily window, switchable with repository variables; and a static landing page that shows the video, wakes the server in the background and offers the demo the moment it is ready. The server allows cross-origin reads of the health route only, from one configured origin.
- **Quote.** "pantalla de carga para que la gente no tenga que esperar en Render" *(a loading screen so people do not have to wait on Render)*.
- **Not yet reviewed (executor choice).** The schedule is in UTC with the Madrid hour checked inside the job, because a cron time-zone field could not be confirmed from a primary source.
- **Decided by.** Isaac, 2026-11-21.
- **Implemented in.** [#59](https://github.com/isaacboque/mandate/pull/59).
- **Verified by.** `test/keepalive.test.ts`, `test/landing-status.test.ts`, `test/health-cors.test.ts`. The workflows themselves have not run yet; GitHub's schedule is best effort, so a few cold starts a day can still happen and the landing page covers them.

### D20. Record who decided what

- **Decision.** The split between the person who decides and the tool that implements is documented as part of the project, with this log and a short section in [HOW-I-BUILT-THIS.md](HOW-I-BUILT-THIS.md).
- **Quote.** "yo haya tomado decisiones y Claude Code las haya implementado" *(I have made decisions and Claude Code has implemented them)*.
- **Decided by.** Isaac, 2026-11-21.
- **Implemented in.** [#56](https://github.com/isaacboque/mandate/pull/56), [#60](https://github.com/isaacboque/mandate/pull/60), and this page.
- **Verified by.** Every entry names a pull request or a source document, and every quote was checked against the approval line it comes from.

## Open items for Isaac

- **Rationale not recorded:** D10, D15, and the reasons behind D16 to D19. Filling these in turns the log from a list of decisions into a record of reasoning.
- **Executor choices waiting for review:** no key field in the web page (D12), the model-call queue and daily budget (D11), the shared run of the two arms (D17), and the UTC schedule of the keep-alive (D19).
- **Not run yet, so not claimed:** the real-model, adaptive-attacker and monitor results (D16 to D18) and the keep-alive workflows (D19).

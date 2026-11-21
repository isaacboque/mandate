# Decisions

Product, safety and evaluation decisions behind Mandate, newest first. **Isaac decided; Claude Code implemented** each one from a task file, and wrote its smaller choices in the pull request under "Decisions". Isaac's own words, where short, are quoted from the `approved:` line of the task (Spanish, verbatim). Task ids are in Isaac's private task vault, so a task id here is a reference, not a link; the pull request numbers are public. Where no rationale was written down it says **Rationale not recorded** instead of guessing one.

"Implementation choices accepted by Isaac" are listed apart from decisions: a choice appears there only when a later task or note shows he accepted it. Everything else the executor chose is marked "executor choice, not yet reviewed".

Reading guide: *Decided by* is Isaac with the date. *Implemented in* is the pull request (PR numbers are on this repository). *Verified by* is the check that would fail if it were not true.

## 2026-11-22 batch (queued the day the residency application closes)

### D18. Model monitor vs code monitor
- **Context.** The regex detector flags 19 of 78 obfuscated injections ([EVIDENCE.md](EVIDENCE.md)).
- **Decision.** Run the experiment now: a model monitor (Llama Prompt Guard 2, gpt-oss-safeguard) against the regex on one dataset. Isaac: "monitor con modelo vs monitor de código".
- **Alternatives.** Rationale not recorded.
- **Consequences.** The harness exists and the regex baseline is measured (22/81 recall, 9/53 false positives); the model rows are `TODO(Isaac)` until he runs it with his Groq key.
- **Decided by.** Isaac, 2026-11-21 (task 2026-11-22-mandate-24-monitor-experiment).
- **Implemented in.** [#55](https://github.com/isaacboque/mandate/pull/55).
- **Verified by.** `test/monitors.test.ts`; `npm run eval:monitors -- --monitors regex` reproduces 19/78 on the variants.

### D17. Stronger statistics, a better threat model, no cold-start wait
- **Decision.** Three further requests, all queued 2026-11-21: make the real-model statistics less weak ("para que no sea tan débil"), improve the threat model ("Mejora el modelo de amenaza"), and spare visitors the free-tier wake-up wait ("pantalla de carga para que la gente no tenga que esperar en Render").
- **Alternatives and rationale.** Rationale not recorded.
- **Decided by.** Isaac, 2026-11-21 (tasks 2026-11-22-mandate-25, -26, -27).
- **Implemented in.** Queued when this page was written; the pull request numbers are added here when each merges.
- **Verified by.** Not yet; see each task's own verification when merged.

### D16. Decisions made by the person, implemented by Claude Code, documented
- **Decision.** The record of who decided and who built is part of the submission. Isaac: "yo haya tomado decisiones y Claude Code las haya implementado".
- **Decided by.** Isaac, 2026-11-21 (task 2026-11-22-mandate-28-decision-log).
- **Implemented in.** This page and [HOW-I-BUILT-THIS.md](HOW-I-BUILT-THIS.md).
- **Verified by.** Every entry names a task id or PR; quotes copied from the task files.

## 2026-11-21

### D15. Keys only in the environment, no key field in the web page
- **Context.** Isaac asked that people can use their own key. Isaac: "ponga su propia api key en el env y funcione".
- **Decision.** The provider is detected from the key in the environment (`GOOGLE_GENERATIVE_AI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`); misconfiguration is reported at start-up; written up in [CONFIGURATION.md](CONFIGURATION.md).
- **Executor choice, not yet reviewed.** No field to type a key into the page: a key sent through the browser, network and a shared server's logs is the stated reason in CONFIGURATION.md. Isaac's words say "in the env"; the explicit "no key field in the page" is the executor's reading.
- **Decided by.** Isaac, 2026-11-21 (task 2026-11-21-mandate-20-bring-your-own-key).
- **Implemented in.** [#50](https://github.com/isaacboque/mandate/pull/50).
- **Verified by.** `npm run doctor`, tests for `resolveLlm`.

### D14. After signing, the agent carries on and proposes
- **Decision.** After a person signs a draft from the chat, the agent runs a follow-up turn (searches, proposes; never signs or pays). A limit hit mid-turn no longer contradicts a cart already proposed. Isaac: "tras firmar el agente sigue solo".
- **Alternatives.** Rationale not recorded.
- **Decided by.** Isaac, 2026-11-21 (task 2026-11-21-mandate-23-after-sign-flow).
- **Implemented in.** [#54](https://github.com/isaacboque/mandate/pull/54).
- **Verified by.** Service tests and the browser walk (`npm run screenshots`).

### D13. One amount in the ask drafts the contract
- **Context.** Seen live: "Indoor futsal shoes, max 90 €" made the model ask for a total budget first.
- **Decision.** A single amount is both total budget and per-item cap; the draft states the assumption and the person reviews before signing. Isaac: "que con una sola cifra el agente redacte el borrador sin preguntar".
- **Decided by.** Isaac, 2026-11-21 (task 2026-11-21-mandate-22-one-amount-drafts).
- **Implemented in.** [#53](https://github.com/isaacboque/mandate/pull/53).
- **Verified by.** A service test: total = cap = 9000 cents with an assumption line.

### D12. Public demo on Isaac's free Groq key, honest about limits
- **Decision.** The hosted demo uses `gpt-oss-120b` on Isaac's free Groq key. When the quota is hit, the chat says it is a usage limit, not a bug. Isaac: "haz que la demo funcione con mi apikey gratuita" and "diga que es por eso y no porque esté mal". The limit card was polished in a follow-up he also approved (task 2026-11-21-mandate-21).
- **Executor choice, not yet reviewed.** The one-call-at-a-time queue and the optional `LLM_DAILY_TURN_BUDGET` (default 150).
- **Decided by.** Isaac, 2026-11-21 (tasks 2026-11-21-mandate-18 and -21).
- **Implemented in.** [#49](https://github.com/isaacboque/mandate/pull/49), [#52](https://github.com/isaacboque/mandate/pull/52).
- **Verified by.** Failure-classification and limit-card tests; browser run.

### D11. The offline agent only as an explicit per-person choice
- **Decision.** Switching to the rules agent is a button the person presses, per session, labelled in the header. It is never an automatic fallback.
- **Alternatives and rationale.** Rationale not recorded beyond the rule itself; it follows D10.
- **Decided by.** Isaac, 2026-11-21 (task 2026-11-21-mandate-18-demo-real-llm, whose brief states the rule).
- **Implemented in.** [#49](https://github.com/isaacboque/mandate/pull/49).
- **Verified by.** Service tests for the per-session flag.

### D10. Fail closed when a configured LLM fails
- **Context.** In a real run a provider rejected a model's tool call; the service fell back to the rules agent, which bought the attacker's listing (inside the mandate terms). So an adversarial input could force a failure and hand control to the most gullible agent ([ticket 26](wayfinder/tickets/26-fallback-fail-closed.md)).
- **Decision.** With a model configured, a failed call proposes nothing and shows an error card. The rules agent answers only when no model is configured. Isaac: "fallar cerrado".
- **Decided by.** Isaac, 2026-11-21, accepting the recommendation (task 2026-11-21-mandate-16-fail-closed).
- **Implemented in.** [#46](https://github.com/isaacboque/mandate/pull/46).
- **Verified by.** A deterministic agent scenario with a mock model that throws mid-turn; `npm run eval:mutants` still 100%.

### D9. Publish the real-model numbers, framed honestly
- **Decision.** Publish the figures from Isaac's two runs, stating they are open-weight models via Groq, not Claude, with date, k, n and 95% intervals. Isaac: "publicar cifras".
- **Decided by.** Isaac, 2026-11-21 (task 2026-11-21-mandate-17-publish-real-numbers).
- **Implemented in.** [#47](https://github.com/isaacboque/mandate/pull/47).
- **Verified by.** Figures copied from the run outputs; see "Not claimed" in [EVIDENCE.md](EVIDENCE.md).

## 2026-11-20

### D8. Measure real models on Groq's free tier
- **Decision.** Add a Groq provider and run `eval:real` on open-weight models. Isaac: "i'll get a groq one". He has no paid API access, so the models are not Claude, and that is stated everywhere.
- **Decided by.** Isaac, 2026-11-20 (task 2026-11-20-mandate-14-groq-provider).
- **Implemented in.** [#44](https://github.com/isaacboque/mandate/pull/44).
- **Verified by.** Provider tests; Isaac's own runs.

### D7. Split "money outside the mandate" from "attacker-chosen purchase"
- **Context.** The first real run counted a poisoned listing that fit every mandate term as a violation, mixing two different things.
- **Decision.** Report them apart: outside the mandate terms (must be 0) and attacker-chosen purchase (poisoned listing bought after approval, within terms). Count only LLM-answered runs in model rates.
- **Decided by.** The plan was agreed in chat after Isaac ran the eval (task 2026-11-20-mandate-15-real-eval-honest-metrics).
- **Implemented in.** [#45](https://github.com/isaacboque/mandate/pull/45).
- **Verified by.** `src/eval/realModel.ts` tests.

### D6. The goal: a fit for LinkedIn and the Anthropic residency
- **Decision.** Plan the next work around a research-grade evidence page. Isaac: "un fit perfecto en mi linkedn y para la residencia de anthropic". Earlier: "mandate tiene que servir para que tenga mas posibilidades para anthropic" (2026-11-19).
- **Implemented in.** [#38](https://github.com/isaacboque/mandate/pull/38) to [#43](https://github.com/isaacboque/mandate/pull/43) (oracle, real-model run, threat model, control metrics, injection variants, write-up).
- **Verified by.** [EVIDENCE.md](EVIDENCE.md), each figure with its command.
- **Decided by.** Isaac, 2026-11-19 and 2026-11-20 (tasks 2026-11-19-mandate-08 to -10, 2026-11-20-mandate-11 to -13).

## 2026-11-19

### D5. Only a person signs, amends, revokes, approves or pays
- **Decision.** The agent never signs, not even under a threshold. Isaac: "firmar siempre el usuario (aceptar) / revocar usuario". Ticket: [17](wayfinder/tickets/17-agent-auto-sign.md) "Decided by Isaac 2026-11-19: no".
- **Alternatives.** Auto-sign under a threshold. Rationale in the ticket: signing is the one act that creates spending power.
- **Decided by.** Isaac, 2026-11-19 (task 2026-11-19-mandate-01-hygiene).
- **Implemented in.** [#30](https://github.com/isaacboque/mandate/pull/30).
- **Verified by.** Agent scenarios a01-a07; mutation run.

### D4. Agent-first refocus
- **Decision.** Make Mandate a chat agent beside a contracts panel, shopping only, drafting contracts from natural language, amendments, several active contracts with revoke, spending and audit queries. Isaac: "quiero que se enfoque mas a un agente". Goal: technical portfolio and LinkedIn; no accounts or real persistence.
- **Decided by.** Isaac, 2026-11-19 (tasks 2026-11-19-mandate-agent-core and -agent-ui).
- **Implemented in.** [#28](https://github.com/isaacboque/mandate/pull/28), [#29](https://github.com/isaacboque/mandate/pull/29).
- **Verified by.** `npm run eval` agent scenarios; the end-to-end browser run.

### D3. Keep the internal contract ids in the agent's text
- **Decision.** Accepted as is, not worth fixing.
- **Rationale not recorded.** The only written source is the brief of task 2026-11-22-mandate-28; no task, PR or note records the decision or its reason.

## Foundations

### D2. Sandbox only, declared as a limit
- **Decision.** The merchant of record is a PayPal sandbox account; a real merchant handoff is not built, and the README, [THREAT-MODEL.md](THREAT-MODEL.md) and [EVIDENCE.md](EVIDENCE.md) say so.
- **Decided by.** Isaac ([PLAN.md](PLAN.md), "Decided by Isaac 2026-11-11"; see "Architecture" there).
- **Implemented in.** The original build pull requests (M1-M8) and [#26](https://github.com/isaacboque/mandate/pull/26).

### D1. The agent can only propose; the guardrails are plain code
- **Decision.** The LLM has no tool that pays; `checkCart` and the checkout re-check run in code and an independent oracle judges the result. See [HOW-I-BUILT-THIS.md](HOW-I-BUILT-THIS.md).
- **Decided by.** Isaac ([PLAN.md](PLAN.md)).
- **Verified by.** `npm run eval` (58 scenarios), `npm run eval:mutants` (11 of 11 guardrails caught).

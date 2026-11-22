# How I built this

I built this with Claude, an AI model, writing the code under my direction. This page says what that meant in practice: which tools I used, what I decided and what I delegated, and how the output was checked. It only states what the repo, its commits and its pull requests show.

## Who did what

Isaac set the direction, made the decisions and reviewed the results. Claude Code wrote most of the code, tests and docs under those decisions, working from task files he queued, one pull request at a time. Each decision, with who made it, the pull request that implemented it and the check that verifies it, is in [DECISIONS.md](DECISIONS.md). Where no reason was written down, the log says so instead of inventing one. Claude's smaller implementation choices sit in each pull request under "Decisions"; none of them is recorded in the decision log until Isaac has reviewed it and accepted it.

## Tooling

I used Claude Code for implementation, mostly with Claude Sonnet 5.5 (the commit trailers also name Claude Opus 5.5 on two commits and Claude Fable 5.2 on one): it worked through the work items in [hackathon plan](history/hackathon-plan.md) one pull request at a time, on its own branch, with the checks in [AGENTS.md](../AGENTS.md) run before each PR, and wrote its smaller product choices into each PR description under "Decisions". At runtime the app can put a different model behind the shopping agent (Google, OpenAI, Anthropic or Groq; the hosted demo uses `gpt-oss-120b` on Groq); that is part of the product, not of how it was built.

## Who decided what

| Decided by Isaac | Delegated to Claude |
| --- | --- |
| The project, its pitch and its scope, written down as [hackathon plan](history/hackathon-plan.md) ("Decided by Isaac") | Writing the code, tests and docs for each work item (M1–M8 and the later PRs) |
| The core design: the agent can only propose, guardrails are plain code outside the LLM, PayPal pays only after approval and a checkout re-check | The details inside each guardrail, recorded per PR under "Decisions" (for example the 10-minute price freshness window, exclusive expiry, empty merchant list means any merchant) |
| The stack, the work-item order and the rule "one PR per work item, CI must pass" ([AGENTS.md](../AGENTS.md)) | Working around tool limits, such as calling the PayPal Orders v2 REST API directly because the toolkit's `create_order` only accepts USD |
| Reusing the trace, approval queue and design system from my own earlier project ([Origin and reuse](../README.md#origin-and-reuse)) | Reading the Channel3 API: price units, cheapest in-stock offer, attribute mapping, with a smoke script for me to confirm them |
| What the eval must measure: spend safety at 100%, injection resistance, task success ([hackathon plan](history/hackathon-plan.md), "Eval") | Writing the eval scenarios, the scripted "fooled" model and the independent oracle |
| Saying plainly that the merchant of record is a sandbox account and a real merchant handoff is not built ([hackathon plan](history/hackathon-plan.md), "Architecture") | Holding scope on submission day, e.g. no "any category" option and no EU to US size conversion |
| The merge rule: every change goes through a pull request, and nothing merges unless CI passes ([AGENTS.md](../AGENTS.md)) | Opening each pull request with its checks run and its decisions written down, so the diff and the reasoning can be read together |

## How the output was checked

I did not take the code on trust. Four things check it, and all of them run without keys:

- **Eval:** `npm run eval` runs 61 deterministic scenarios on the fixture catalog with a simulated clock and mock payments. A scripted "fooled" model proposes carts the mandate forbids, and an independent oracle that never calls the guardrail code checks every captured payment against the mandate it was made under. Results are in [eval/RESULTS.md](../eval/RESULTS.md). To check that the eval can fail, `npm run eval:mutants` switches off each of the 11 guardrails in turn and expects at least one scenario to fail: all 11 are caught ([docs/MUTATION.md](MUTATION.md)). A separate test covers the oracle itself.
- **Tests:** `npm test` runs the Vitest suite (mandate checks, catalog, payments, service, sessions, draft, API). Tests use mocks only, with no real LLM, PayPal or Channel3 calls.
- **Typecheck and build:** `npm run typecheck` (strict TypeScript, server and web) and `npm run build`.
- **CI:** GitHub Actions runs lint, typecheck, tests, the eval, the mutation run, the injection variants and the build on every pull request and on main ([ci.yml](../.github/workflows/ci.yml)). Nothing merges unless all of them pass.

The checks are themselves checked. The eval's oracle, the scenarios and the judge's labels were written with Claude, so a green run could mean the assistant and its own tests agree on the same mistake. That is why the mutation run exists, why I reviewed the first set of judge calibration labels myself and labelled real replies blind against it ([DECISIONS.md](DECISIONS.md), D21 and D22), and why findings against my own work, such as the fallback flaw and the amendment scope creep, are published with their fix.

The guardrails are plain code outside the LLM on purpose. Code written by a model, or a model acting at runtime, can be wrong in ways that are hard to spot. A pure, deterministic `checkCart` can be unit-tested and evaluated line by line, and it behaves the same whatever any model says. The runtime model has no tool that pays, so the checks above cover the part that can move money. What they do not prove is listed in [THREAT-MODEL.md](THREAT-MODEL.md) and the README's limits.

## Where Claude contributed

The `Co-authored-by: Claude` trailers in the commit history show where Claude contributed; I keep them on purpose.

# How I built this

Most of the code in this repo was written by Claude, an AI model, working under my direction. This page says what that meant in practice: which tools I used, what I decided and what I delegated, and how the output was checked. It only states what the repo, its commits and its pull requests show; where I could not point to evidence, it says `TODO(Isaac): confirm`.

## Tooling

I used Claude Code (Claude Sonnet 5.5) for implementation: it worked through the work items in [PLAN.md](PLAN.md) one pull request at a time, on its own branch, with the checks in [AGENTS.md](../AGENTS.md) run before each PR, and wrote its smaller product choices into each PR description under "Decisions". I used Claude in chat for planning and review. `TODO(Isaac): confirm` the chat part; the repo itself only shows Claude Code. At runtime the app can use a different model (Gemini by default) as the shopping agent; that is part of the product, not of how it was built.

## Who decided what

| Decided by Isaac | Delegated to Claude |
| --- | --- |
| The project, its pitch and its scope, written down as [PLAN.md](PLAN.md) ("Decided by Isaac") | Writing the code, tests and docs for each work item (M1–M8 and the later PRs) |
| The core design: the agent can only propose, guardrails are plain code outside the LLM, PayPal pays only after approval and a checkout re-check | The details inside each guardrail, recorded per PR under "Decisions" (for example the 10-minute price freshness window, exclusive expiry, empty merchant list means any merchant) |
| The stack, the work-item order and the rule "one PR per work item, CI must pass" ([AGENTS.md](../AGENTS.md)) | Working around tool limits, such as calling the PayPal Orders v2 REST API directly because the toolkit's `create_order` only accepts USD |
| Reusing the trace, approval queue and design system from my own earlier project ([Reuse](../README.md#reuse)) | Reading the Channel3 API: price units, cheapest in-stock offer, attribute mapping, with a smoke script for me to confirm them |
| What the eval must measure: spend safety at 100%, injection resistance, task success (PLAN.md, "Eval") | Writing the eval scenarios, the scripted "fooled" model and the independent oracle |
| Saying plainly that the merchant of record is a sandbox account and a real merchant handoff is not built (PLAN.md, "Architecture") | Holding scope on submission day, e.g. no "any category" option and no EU to US size conversion |
| Reviewing the pull requests and CI results before merging. `TODO(Isaac): confirm` how closely each PR was read | |
| The mutation check ("I broke two guardrails on purpose", in the case study). `TODO(Isaac): confirm`: the M7 PR says Claude ran it | |

## How the output was checked

I did not take the code on trust. Four things check it, and all of them run without keys:

- **Eval:** `npm run eval` runs 46 deterministic scenarios on the fixture catalog with a simulated clock and mock payments. A scripted "fooled" model proposes carts the mandate forbids, and an independent oracle that never calls the guardrail code checks every captured payment against the mandate it was made under. Results are in [eval/RESULTS.md](../eval/RESULTS.md). To check that the eval can fail, two guardrails were disabled on purpose and the spend-safety metric dropped below 100%, and a test covers the oracle itself.
- **Tests:** `npm test` runs the Vitest suite (mandate checks, catalog, payments, service, sessions, draft, API). Tests use mocks only, with no real LLM, PayPal or Channel3 calls.
- **Typecheck and build:** `npm run typecheck` (strict TypeScript, server and web) and `npm run build`.
- **CI:** GitHub Actions runs typecheck, tests, eval and build on every pull request and on main ([ci.yml](../.github/workflows/ci.yml)).

The guardrails are plain code outside the LLM on purpose. Code written by a model, or a model acting at runtime, can be wrong in ways that are hard to spot. A pure, deterministic `checkCart` can be unit-tested and evaluated line by line, and it behaves the same whatever any model says. The runtime model has no tool that pays, so the checks above cover the part that can move money. What they do not prove is listed in [THREAT-MODEL.md](THREAT-MODEL.md) and the README's limits.

## Where Claude contributed

The `Co-authored-by: Claude` trailers in the commit history show where Claude contributed; I keep them on purpose.

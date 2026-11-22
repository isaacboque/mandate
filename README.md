# Mandate

> An agent you talk to, bound by contracts it cannot sign.

[![CI](https://github.com/isaacboque/mandate/actions/workflows/ci.yml/badge.svg)](https://github.com/isaacboque/mandate/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node 20+](https://img.shields.io/badge/node-20%2B-339933.svg)

**[Live demo](https://isaacboque.github.io/mandate/)** · [Write-up](docs/WRITEUP.md) · [Evidence](docs/EVIDENCE.md) · [Threat model](docs/THREAT-MODEL.md) · [Decision log](docs/DECISIONS.md)

![A poisoned listing is blocked, with the reasons](docs/demo.gif)

Mandate is a shopping agent that can only propose. You tell it what you want in plain words; it drafts a spending contract (a *mandate*: budget, per-item cap, categories, shops, quantity, expiry) that only you can sign, amend or revoke. Inside a signed contract it searches a product catalog and proposes a cart. Deterministic code outside the model checks every proposal against the mandate, and checks it again at checkout against the live price. A person approves; payment runs through the PayPal sandbox.

It is a sandbox project: no real money moves. Its purpose is to show, with evidence a reviewer can reproduce, that an agent's spending authority can be held by structure instead of by trusting the model.

## Why

An agent that spends money inherits every weakness of the model driving it. A product listing is text written by a stranger, and a language model will follow an instruction hidden in it as readily as one from its user. The usual answers are to trust the model to resist, or to add a second model to watch the first. Both put the guarantee in the component that cannot give one.

Mandate treats the model as an untrusted component and puts the authority in structure:

- **Explicit authority.** A signed contract (budget, per-item cap, categories, shops, quantity, expiry) that only a person can create, change or revoke.
- **Enforcement outside the model.** Every cart is checked in plain code at proposal and again at checkout, against live data. The agent has no tool that pays, so there is nothing for a hijacked model to call.
- **Claims that are measured.** An independent oracle, models fooled on purpose and mutation testing check both that the controls hold and that the checks themselves can fail.

The question the project studies: what has to be true of the surrounding system for an agent's spending authority to hold even when the model is fooled, and how do you measure that? [docs/WRITEUP.md](docs/WRITEUP.md) is the two-minute version.

## Quickstart

Node 20 or newer. Demo mode needs no keys: a fixture catalog and simulated payments.

```bash
git clone https://github.com/isaacboque/mandate.git && cd mandate
npm ci
npm run build && npm start        # http://localhost:8787
```

Click a suggestion such as "Indoor futsal shoes, max 90 €" → review the draft contract and press **Sign contract** → the agent proposes a cart → **Approve** → **Pay (simulate buyer)**. **Try an attack** shows a poisoned listing being blocked, with the reasons.

To put a real model behind it, copy `.env.example` to `.env`, set the key of the provider you use (Google, OpenAI, Anthropic or Groq, which has a free tier) and run `npm run doctor`. Keys stay on the server; the web page never asks for one. Reference: [docs/CONFIGURATION.md](docs/CONFIGURATION.md). Live mode (real catalog, PayPal sandbox) and hosting: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

<table>
  <tr>
    <th>1. Ask, get a draft</th>
    <th>2. Review and sign</th>
    <th>3. Attack blocked</th>
    <th>4. Revoked, then refused</th>
  </tr>
  <tr>
    <td><img src="docs/screenshots/phone-1-chat-draft.png" alt="Chat: the agent drafts a 90 euro contract from one sentence; nothing is signed" width="220"></td>
    <td><img src="docs/screenshots/phone-2-draft-form.png" alt="The draft as an editable form, each field marked as coming from the agent" width="220"></td>
    <td><img src="docs/screenshots/phone-6-attack.png" alt="A poisoned listing tells the model to buy 10; plain code blocks it and lists the checks that failed" width="220"></td>
    <td><img src="docs/screenshots/phone-10-refused.png" alt="After the contract is revoked the checkout re-check refuses the payment" width="220"></td>
  </tr>
</table>

## How it works

```mermaid
flowchart LR
  U[Person] -->|chats| A[Agent<br/>LLM or rules]
  A -->|drafts, amendments<br/>pending data only| D[Draft / amendment]
  D -->|only the person signs| M[Mandate<br/>sha256 hash]
  U -->|signs, amends, revokes| D
  A -->|search, get product| C[(Catalog<br/>Channel3 or fixtures)]
  A -->|propose cart<br/>only enqueues| G{{Guardrails<br/>checkCart, pure code}}
  M --> G
  G -->|blocked| X[Never reaches approval]
  G -->|passes| Q[Approval queue]
  U -->|approves| Q
  M -. autonomy rule .-> Q
  Q --> R{{Re-check at checkout<br/>mandate hash, live price, all guardrails}}
  R -->|ok| P[PayPal Orders<br/>create, buyer approves, capture]
  R -->|price drift, expiry, out of stock| F[Stopped, nothing paid]
```

| Part | Where | What it does |
| --- | --- | --- |
| Mandate | `src/mandate` | Typed contract, signed with a short sha256 of its canonical JSON. `checkCart` runs 11 named checks: total budget, per-item cap, category, merchant, quantity, expiry, currency, hard attributes, price freshness, injection flag, mandate active. |
| Agent | `src/agent` | A rules agent, or an LLM through the Vercel AI SDK. The chat agent has eight tools, none of which signs, amends, revokes, approves or pays. A failed model call fails closed. |
| Untrusted text | `src/catalog` | Product titles and descriptions never enter a system prompt; they reach the model as quoted data. A detector flags injection-looking listings as one extra layer. |
| Approval and payments | `src/approval`, `src/payments` | A person approves, or the mandate's own autonomy rule does. Payments refuse to run without an approved, unused approval. PayPal Orders v2 in the sandbox, idempotent. |
| Service and API | `src/service`, `src/server` | One service ties it together; a Hono API with per-visitor sessions and rate limits. |
| Interface | `web/` | A chat beside a contracts panel. Sign, amend, revoke, approve and pay are buttons on human-only endpoints; the chat renders typed cards from the server, never actions from model text. |
| Trace | `src/trace` | Every model call, tool call, guardrail decision, approval and payment response, as JSONL and in the UI. |

Design in more detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/AGENT-SPEC.md](docs/AGENT-SPEC.md).

## How it is checked

Everything below runs without a key. The figures are the ones in [docs/EVIDENCE.md](docs/EVIDENCE.md), each with the command that reproduces it.

| Check | Command | Result |
| --- | --- | --- |
| Unit and integration tests, mocks only | `npm test` | 633 passing |
| 60 scenarios, with a model that is fooled on purpose, judged by an oracle that never calls the guardrail code | `npm run eval` | no payment outside the mandate: 60/60 |
| Each of the 11 guardrails switched off in turn; the eval must notice | `npm run eval:mutants` | 11 of 11 caught ([MUTATION.md](docs/MUTATION.md)) |
| 78 obfuscated injection variants (13 families) | `npm run eval:injection-variants` | detector flags 19; money outside the mandate 0/78 |
| Types, lint, build | `npm run typecheck`, `npm run lint`, `npm run build` | CI on every pull request |

**What the scripted eval shows, and what it does not.** The adversarial scenarios use a model that is fooled on purpose: it proposes the worst cart an attacker could want. That is the right test for the claim being made. The guarantee is that money cannot move outside the mandate whatever the model does, so the worst-case model is the correct adversary, and the result does not depend on how any particular model behaves. What it cannot show is how often a real model is fooled, how useful one is inside the controls, or what happens when a provider fails mid-turn. Those need real models, and are measured separately: a first run on three open-weight models served by Groq (not Claude; 19 cases, one repeat) found a flaw the scripted eval could not see, a failed model call handing the turn to the rules agent, which is fixed. A first pass of the larger 65-case set on `gpt-oss-120b` (one repeat, with a paired before-and-after comparison) had no money outside the mandate terms in any of 65 runs, which bounds the rate below about 6% for that model and did not separate the two arms. The repeats, an adaptive attacker and a model-versus-code monitor are built and not run yet; nothing here claims their results. How they are run is in [docs/EVALUATION.md](docs/EVALUATION.md); the hypotheses, and what would count as failure, were fixed beforehand in [docs/EVAL-PROTOCOL.md](docs/EVAL-PROTOCOL.md).

The evaluations follow the stages of an eval workflow: a specification with pass criteria, a labelled golden dataset ([`eval/datasets/`](eval/datasets/README.md)), automated checks from an oracle that reads state, a model judge for what the agent says (checked against labelled replies before its verdicts are used), and an interpretation step that compares per category so a better average cannot hide a regression ([docs/EVALUATION.md](docs/EVALUATION.md)).

Scenario results, generated by `npm run eval`:

<!-- eval:start -->
| Metric | Result | Scenarios |
| --- | --- | --- |
| **Spend safety** (no payment captured outside the mandate; must be 100%) | **100%** | 60/60 |
| Guardrail scenarios (over budget, cap, category, merchant, quantity, expiry, drift, currency, retries, bypass attempts) | 100% | 28/28 |
| Injection resistance (poisoned listings never change what is executed) | 100% | 7/7 |
| Task success (a valid item exists → a valid cart is proposed) | 100% | 12/12 |
| Agent scenarios (the concierge drafts, proposes and explains; only a person signs, amends, revokes, approves or pays) | 100% | 13/13 |
<!-- eval:end -->

## Limits

- **Sandbox only.** The merchant of record is a PayPal sandbox account. Paying a real merchant would be a payments product, not this project.
- **A person approving a bad cart is not stopped.** Mandate guarantees a cart is inside the contract the person signed; in 20 of the 78 injection variants the cart fit the contract and only the approver could have caught it.
- **The detector is regex-based.** It is one layer and misses most obfuscations; the controls that hold are structural.
- **The real-model evidence is thin.** 19 runs on each of three open-weight models and a first pass of 65 on one of them, one repeat each, none Claude. No money left the mandate terms in any run; that supports "the structure held and exposed a flaw", and bounds the rate below about 6% for one model, it does not show the rate is zero. The repeats are built and pending.
- **State is in memory.** No accounts, shipping addresses, multi-currency or refunds. The catalog is trusted for price and stock.

The full list, with reasons, is in [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md).

## How it was built

Mandate was built with Claude Code as a way to raise both the speed and the quality of the work. The author makes the product and safety decisions and reviews the output; the assistant does most of the typing. The workflow applies to the assistant the same principle the product applies to its agent: it proposes, and checks outside it decide what counts.

- **Specification and decisions first.** Behaviour is written down in [docs/AGENT-SPEC.md](docs/AGENT-SPEC.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); each product and safety decision is an ADR-style entry in [docs/DECISIONS.md](docs/DECISIONS.md) with its implementing pull request and the check that verifies it.
- **Context engineering.** [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md) give the assistant the commands, the map of the code and the non-negotiable rules: least-privilege tools (the agent cannot sign or pay), money as integer cents, catalog text as untrusted data, fail closed, never weaken a check to get green.
- **Test-driven agentic loop.** Work is queued as task files. For each one the assistant writes the failing test first, implements, runs lint, types, tests and evals, and opens a pull request; CI gates the merge.
- **Evals as the safety net for generated code.** An independent oracle that never calls the guardrail code judges 60 adversarial scenarios; mutation testing switches each guardrail off to prove the eval can fail; 78 obfuscated prompt-injection variants measure the detector apart from the structural controls.
- **Threat modelling and red-teaming.** An explicit attacker table, an adaptive-attacker harness and real-model runs. A scope-creep bug found on the live demo (an amendment that changed a field nobody named) was reproduced, fixed in code and covered by new scenarios.
- **Observability.** Every model call, tool call, guardrail decision and payment step is traced to JSONL, so a run can be audited after the fact.

Commit trailers (`Co-authored-by`) record where Claude contributed. More: [docs/HOW-I-BUILT-THIS.md](docs/HOW-I-BUILT-THIS.md), [CONTRIBUTING.md](CONTRIBUTING.md).

## Repository

```
src/        server code: mandate, agent, service, server, catalog, approval, payments, llm, trace, eval, ops
web/        React interface
site/       static landing page (GitHub Pages)
scripts/    evaluation and operations scripts
test/       tests (Vitest)
eval/       generated evaluation reports
fixtures/   fixture catalog
docs/       documentation, see docs/README.md
```

## Origin and reuse

Started as a PayPal AI Hackathon project. The trace, approval-queue pattern, PayPal OAuth refresh approach and design system come from the author's earlier [even-steven](https://github.com/isaacboque/even-steven) (MIT), copied rather than imported. The guardrails, mandate signing, catalog layer, agent, service, interface and eval are new in this repository.

## License

[MIT](LICENSE)

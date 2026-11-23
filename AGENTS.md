# AGENTS.md

Instructions for coding agents (Claude Code and others) working in this repository. Humans: see [CONTRIBUTING.md](CONTRIBUTING.md); the design is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## What this is

Mandate is a shopping agent that can only propose. A person signs a spending contract (a *mandate*); deterministic code outside the model checks every cart against it at proposal and again at checkout; payments run in a sandbox. The point of the project is the evidence that the structure holds, not the shop.

## Commands

```bash
npm run dev                  # API :8787 + UI :5173, demo mode, no keys
npm run lint && npm run typecheck && npm test && npm run build
npm run eval                 # 62 deterministic scenarios judged by an independent oracle
npm run eval:mutants         # each guardrail switched off in turn: the eval must fail
npm run eval:injection-variants
npm run eval:datasets        # regenerate eval/datasets/*.jsonl when scenarios or cases change
```

Commands that call a real model (`eval:real`, `eval:adaptive`, `eval:monitors`, `eval:judge`) cost quota and need a key from the person's own environment. Do not run them unless asked, and never print or store a key.

## Where things are

| Path | What lives there |
| --- | --- |
| `src/mandate` | The contract: types, signing, the 11 checks in `check.ts`, amendment chain, drafting, amendment scope |
| `src/agent` | The rules agent and the LLM concierge with its eight propose-only tools |
| `src/service` | `MandateService`: the one place that ties catalog, agent, guardrails, approvals and payments together |
| `src/server`, `web/` | Hono HTTP API with sessions and rate limits; the React UI |
| `src/catalog`, `src/approval`, `src/payments`, `src/llm`, `src/trace` | Catalog gateways and the injection detector; approval queue; PayPal sandbox and mock gateways; provider selection and failure handling; JSONL trace |
| `src/eval`, `scripts/` | The evaluation harness, oracle, scenarios and experiments, and the scripts that run them |
| `site/` | The static landing page (GitHub Pages) |
| `docs/` | Documentation; [docs/README.md](docs/README.md) is the index |

## Rules

- **Money is integer cents.** Never a float. Every money-moving call goes through the approval queue and is re-checked when it executes.
- **Only a person signs, amends, revokes, approves or pays.** Do not add an agent tool for any of these.
- **Catalog text is untrusted data.** Never put it in a system prompt; quote it as data.
- **A configured model that fails fails closed.** Nothing is proposed; the rules agent answers only when no model is configured.
- **Do not weaken a guardrail, a test or the oracle to make something pass.** If a check seems wrong, say so and propose the change.
- **Tests first** for behaviour changes and fixes: write the failing test, then the code.
- **No secrets** in code, tests, docs or logs. Tests use mocks only.
- Counts quoted in documentation (tests, scenarios) must be updated in the same change that alters them.

## Working agreements

- One topic per pull request; use the template and put choices you made under "Decisions".
- Product and safety decisions belong to the maintainer and are recorded in [docs/DECISIONS.md](docs/DECISIONS.md). Where something is not specified, take the smallest reasonable choice and flag it in the pull request under "Decisions"; never add a choice of your own to `docs/DECISIONS.md`, and do not record a rationale nobody gave.
- Ask before anything outward-facing or hard to reverse (publishing, deleting branches, changing hosting settings).

# Architecture

The idea in one line: **the model can propose, never pay.** Spending authority lives in a signed mandate that plain code enforces, at proposal time and again at checkout.

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
  A -.-> T[(JSONL trace)]
  G -.-> T
  Q -.-> T
  P -.-> T
```

## The pieces

| Part | Where | Role |
| --- | --- | --- |
| Mandate | `src/mandate` | Typed spending limits, signed with a short sha256 of the canonical JSON. `checkCart` runs 11 named checks: total budget, per-item cap, category, merchant, quantity, expiry, currency, hard attributes, price freshness, injection flag, mandate active. |
| Agent | `src/agent` | Vercel AI SDK, provider chosen by `LLM_PROVIDER`. Three tools: `search_products`, `get_product`, `propose_cart`. None can pay; `propose_cart` only enqueues and only accepts products the catalog returned in that run. Without an LLM key a deterministic rules agent does the same job. |
| Catalog | `src/catalog` | Channel3 (live) or a fixture catalog (demo and eval). Product text is untrusted: it reaches the model only as quoted JSON, and a detector flags injection-looking listings. |
| Approval queue | `src/approval` | A person approves, or the mandate's autonomy rule does (`ask_always` or `auto_under` a threshold). Blocked carts never get an approval. Payments refuse to run without an approved, unused approval. |
| Payments | `src/payments` | PayPal Orders v2 in the sandbox (create, buyer approves, capture), idempotent, plus a mock gateway with the same rules. |
| Web UI | `web/src` | Chat (`Chat`, `ProposalCard`) beside a contracts panel (`ContractsPanel`, `DraftForm`, `AmendmentDiff`). Cards are parsed by `cards.ts`, which drops unknown types; agent text is plain text. Mobile: tabs with a dot for what needs you. |
| Service | `src/service` | Glue: proposals, cumulative budget, execution-time re-check, audit export. |
| Trace | `src/trace` | Every model call, tool call, guardrail decision, approval and PayPal response, as JSONL and in the UI. |

## A purchase, step by step

1. The person chats ("indoor futsal shoes, max $90"). The agent drafts a contract into the Contracts panel; nothing is signed yet.
2. The person reviews, edits and presses Sign contract. Only now does the agent search. Later changes arrive as amendments the person signs; revoking is also the person's button.
3. The agent calls the catalog and proposes a cart with a reason per line.
4. `checkCart` runs outside the model. A blocked cart stops here and the UI says which guardrail stopped it.
5. A passing cart waits for approval (a person, or the autonomy rule).
6. At checkout the service re-reads the live price and re-runs the mandate hash and every guardrail, including the budget already approved or paid. Price drift, expiry or a stock-out stops the payment.
7. PayPal creates the order, the buyer approves, the capture happens. The purchase can be downloaded as a JSON audit.

## Design rules

- Money is integer cents.
- The budget belongs to the mandate, not to a cart: approved and paid amounts count against it.
- The guardrails fail closed when data is missing or unreadable (a bad date, a missing size or category). A price that is not a whole number of cents above zero is dropped when the catalog is read; making `checkCart` itself refuse it is [ticket 08](wayfinder/tickets/08-checkcart-price-sanity.md).
- Tests and the eval use mocks only; no keys, no network.

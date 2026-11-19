# Mandate

> An agent you talk to, bound by contracts it cannot sign.

[![CI](https://github.com/isaacboque/mandate/actions/workflows/ci.yml/badge.svg)](https://github.com/isaacboque/mandate/actions/workflows/ci.yml)

**In 30 seconds:** you talk to a shopping agent in plain words. It drafts a spending contract (a *mandate*: budget, caps, categories, shops, expiry) that **only you can sign**, amend or revoke. Inside a signed contract it searches real catalogs and can only *propose* a cart. Plain code outside the LLM checks every proposal against the mandate, a person (or the mandate's own rule) approves, and checkout re-checks the live price before PayPal moves any money. A poisoned product listing can fool the model, but the model has no tool that pays; in the eval no captured payment ever left the mandate. Try it in a minute with no keys: [live demo](https://mandate-gb6t.onrender.com).

You give a shopping agent a **signed mandate**: total budget, per-item cap, categories, merchants, quantity, expiry, and what it may do alone. The agent searches real product catalogs ([Channel3](https://channel3.ai)), proposes a cart with reasons, and pays through **PayPal** only inside the mandate. Everything else waits for a person.

The guardrails are plain code **outside the LLM**. A poisoned product listing can fool the model, but the model has no tool that pays, every proposal is checked by deterministic code, and the mandate and the live price are checked again at checkout. In the 56-scenario eval, with a model that is fooled on purpose, no payment was captured outside the mandate.

**Quickstart (no keys, Node 20+):**

```bash
git clone https://github.com/isaacboque/mandate.git && cd mandate
npm ci
npm run build && npm start      # http://localhost:8787 (demo mode: chat + contracts, fixture catalog, mock payments, no keys)
npm run eval                    # 56 deterministic scenarios, prints the table below
npm run eval:mutants            # switch each of the 11 guardrails off in turn: the eval must notice
```

**How it is checked:** `npm test` (281 tests, mocks only), `npm run eval` (spend safety 56/56 with an oracle that never calls the guardrail code) and `npm run eval:mutants` (11 of 11 guardrails caught when disabled, see [docs/MUTATION.md](docs/MUTATION.md)). None of these call a real LLM; that is the opt-in `npm run eval:real`. Open questions: [docs/wayfinder/MAP.md](docs/wayfinder/MAP.md).

![Chat on the left, contracts on the right: the agent drafted a contract, the person signed it and a purchase is paid](docs/screenshots/desktop-5-paid.png)

| Ask, get a draft | Edit and sign | Attack blocked | Amendment diff | Revoked, then refused |
| --- | --- | --- | --- | --- |
| ![](docs/screenshots/mobile-1-chat-draft.png) | ![](docs/screenshots/mobile-2-draft-form.png) | ![](docs/screenshots/mobile-6-attack.png) | ![](docs/screenshots/mobile-7-amendment.png) | ![](docs/screenshots/mobile-10-refused.png) |

The poisoned-listing attack, blocked on the desktop layout: ![A poisoned listing tells the agent to buy 10 units; the guardrails block it](docs/screenshots/desktop-6-attack.png)

**Live demo:** https://mandate-gb6t.onrender.com (demo mode: fixture catalog and simulated payments, no keys). **Live mode:** https://mandate-live-7q2i.onrender.com (real Channel3 catalog and PayPal sandbox; paying needs a sandbox buyer account, see the section below). The free instances can take about 30 s to wake up.

Started as a PayPal AI Hackathon project. Sandbox only: no real money moves. More: [case study](docs/CASE-STUDY.md) · [architecture](docs/ARCHITECTURE.md) · [threat model](docs/THREAT-MODEL.md) · [60-second demo script](docs/DEMO.md).

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
  A -.-> T[(JSONL trace)]
  G -.-> T
  Q -.-> T
  P -.-> T
```

- **Chat + contracts UI** (`web/`): the agent is a chat; contracts are a panel. A draft is an editable form with the agent's fields marked "from the agent"; an amendment is a before/after diff. Sign, amend, revoke, approve and pay are buttons wired to human-only endpoints; the chat renders only typed cards from the server (unknown card types render nothing) and agent text as plain text. On a phone the two panes are tabs, with a dot when something needs you.
- **Mandate** (`src/mandate`): typed, signed with a short sha256 of its canonical JSON. `checkCart` runs 11 named checks: total budget, per-item cap, category, merchant, quantity, expiry, currency, hard attributes (e.g. size), price freshness, injection flag, mandate active (not revoked or replaced).
- **Agent** (`src/agent`): Vercel AI SDK, provider by `LLM_PROVIDER` (default Google `gemini-2.5-flash`). The concierge has 8 tools (search, get product, propose cart, draft a contract, propose an amendment, list contracts, get spending, explain a block); none signs, amends, revokes, approves or pays. It can only propose, and only products the catalog returned in that run. With no LLM key, a deterministic rules agent does the same job, so the demo and the eval need no keys.
- **Untrusted text** (`src/catalog`): product titles and descriptions are never put in the system prompt. They reach the model only as quoted JSON data, and a detector flags injection-looking listings so the guardrails block them.
- **Approval queue** (`src/approval`): a person approves, or the mandate's autonomy rule does (`ask_always`, or `auto_under` a threshold). Blocked carts never get an approval. Payments refuse to run without an approved, unused approval.
- **Payments** (`src/payments`): PayPal Orders v2 in the sandbox (create, buyer approves, capture), idempotent, plus a mock gateway with the same rules.
- **One sentence is enough**: write what you want with how much you can spend ("indoor futsal shoes, max $90") and the agent drafts the limits into a form in the Contracts panel for you to review; **Sign contract** signs the fields as you left them. The agent does not search before a contract is signed. The draft covers budget, caps, categories (resolved against the catalog's own tree, not guessed by the model), shops, validity and what it may do alone. It only drafts: nothing is signed until you press Sign, and the signed mandate goes through the same validation as one typed by hand. Without an AI model, or if it fails, a simple rules reader does a plainer version and says so.
- **Cumulative budget**: the budget belongs to the whole mandate, not to each cart. What was already approved or paid counts against it, at proposal and again at checkout, so two pending carts cannot both be approved past the limit.
- **Category tree**: a mandate that allows a category allows everything inside it (allow "shoes" and athletic shoes and sneakers come with it); a product passes if its own category or any ancestor is allowed, and with no path from the catalog only its own category counts. The mandate form looks names up in the catalog's category tree as you type.
- **Why nothing?**: when a product is found but blocked, the UI lists it with the guardrail that stopped it and, if it is something you could change (category, shop, cap, budget), a one-click fix that signs an amendment (a successor contract with a new hash that replaces the old one), so the spend already committed still counts. The agent can never do this itself.
- **Audit**: each purchase, and each contract as a whole (the chain of signed contracts, every proposal under it and the trace), can be downloaded as JSON.
- **Trace**: every model call, tool call, guardrail decision, approval and PayPal response, as JSONL and in the UI.

## Try it in 2 minutes (demo mode, no keys)

Start it as in the quickstart above (`npm ci`, `npm run build && npm start`, Node 20+), or for development `npm run dev` (API on :8787, UI on :5173).

Then: click a suggestion such as "Indoor futsal shoes, max 90 €" (or type your own) → the agent answers with a **draft** card → in **Contracts** review the fields and press **Sign contract** → ask for the shoes → **Approve** → **Pay (simulate buyer)**. Click **Try an attack** to see a poisoned listing blocked: the card says what the listing told the model, what the fooled model proposed and which guardrails stopped it. Then type "raise the budget to 200 €": the agent proposes an amendment, you read the diff and press **Sign amendment**; or press **Revoke** and watch a waiting cart be refused at checkout. Without a key the agent runs in "Rules mode" (it says so in the chat header) and understands a few plain requests.

Demo mode uses a fixture catalog (16 products, 3 of them poisoned, 1 with a price that rises at checkout) and mock payments. If you set an LLM key (below) the agent is the LLM instead of the rules agent.

## Run it live (PayPal sandbox + Channel3)

Copy `.env.example` to `.env` and fill in:

```
DEMO_MODE=live
CHANNEL3_API_KEY=...             # free tier at trychannel3.com
PAYPAL_CLIENT_ID=...             # PayPal sandbox app (Orders / "Accept payments" enabled)
PAYPAL_CLIENT_SECRET=...
LLM_PROVIDER=google              # optional; or openai, anthropic
GOOGLE_GENERATIVE_AI_API_KEY=... # optional; without it the rules agent is used
```

Check each piece on its own first:

```bash
npm run smoke:channel3           # searches the real catalog, prints price and merchant
npm run smoke:orders             # creates a 1.00 EUR sandbox order, prints the buyer link, polls, captures
```

Then `npm run build && npm start`. In live mode, **Approve** creates the PayPal order and shows the link; approve it with your sandbox personal (buyer) account, then press **Capture payment**.

## What is proven

On the fixture catalog, with a simulated clock and mock payments (no keys):

- **Spend safety 56/56**: an independent oracle that never calls the guardrail code found no captured payment outside the mandate it was made under.
- **Injection 7/7**: poisoned listings never changed what was executed, even with a "fooled" model that obeys them.
- **Guardrails 28/28**, **task success 12/12** and **agent scenarios 9/9** (the concierge drafts, proposes and explains; only a person signs, amends, revokes, approves or pays).

- **Every guardrail is load-bearing:** switching off any one of the 11 checks makes at least one scenario fail (11/11, [docs/MUTATION.md](docs/MUTATION.md)). For `hard_attributes` and `price_freshness` the failure is on the scenario outcome, not on the oracle.

What this does not prove: it is not a test of a real LLM (see below), not a real-money test, and not a security review of the hosting. See [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md).

**How I built this:** I built it with Claude Code writing the code under my direction, and the commit trailers show where.
I set the scope, the design and what the eval must prove; the eval, tests, typecheck and CI check the output, and the guardrails stay plain code outside the LLM.
What I decided, what I delegated and how it was checked: [docs/HOW-I-BUILT-THIS.md](docs/HOW-I-BUILT-THIS.md).

## PayPal and AI in this project

- **PayPal:** Orders v2 in the sandbox is the only way money moves (create, buyer approves, capture), idempotent, behind the approval queue and a checkout re-check. The toolkit's `create_order` only accepts USD, so the code calls the Orders REST API behind the same tool-shaped interface.
- **AI at runtime:** an optional LLM (Gemini by default; OpenAI or Anthropic by `LLM_PROVIDER`) drafts the mandate form and acts as the shopping agent, with propose-only tools. No AI is involved in the guardrails, the approval queue or the payment logic.
- **AI in development:** the code was written with Claude Code under the author's direction; every change goes through a pull request, and nothing merges unless CI passes.

## Evaluation

`npm run eval` runs 56 deterministic scenarios (fixture catalog, simulated clock, mock payments; no keys). A scripted "fooled" model proposes carts the mandate forbids, and an independent oracle that never calls the guardrail code checks every captured payment against the mandate it was made under. Per-scenario results are in [eval/RESULTS.md](eval/RESULTS.md). CI runs it on every PR.

<!-- eval:start -->
| Metric | Result | Scenarios |
| --- | --- | --- |
| **Spend safety** (no payment captured outside the mandate; must be 100%) | **100%** | 56/56 |
| Guardrail scenarios (over budget, cap, category, merchant, quantity, expiry, drift, currency, retries, bypass attempts) | 100% | 28/28 |
| Injection resistance (poisoned listings never change what is executed) | 100% | 7/7 |
| Task success (a valid item exists → a valid cart is proposed) | 100% | 12/12 |
| Agent scenarios (the concierge drafts, proposes and explains; only a person signs, amends, revokes, approves or pays) | 100% | 9/9 |
<!-- eval:end -->

### Try it against a real model (optional, paid calls)

`npm run eval:real` runs 9 scenarios (6 task, 3 poisoned-listing) with a real LLM as the agent, on the same fixture catalog and the same independent oracle. Put your own key in your own `.env` (copy `.env.example`; `.env` is gitignored): `LLM_PROVIDER` plus `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`. The script never prints or stores keys; it writes its report to `traces/real-model-eval.md` (gitignored). The exit code fails only if money moved outside a mandate; task and injection outcomes are reported, not gated, and cases answered by the fallback rules agent (quota, error) are flagged. CI keeps using the scripted model.

## Limits

- **Sandbox only.** The merchant of record in the demo is my PayPal sandbox business account. Paying the real merchant behind a Channel3 listing is deliberately out of scope: it would need merchant onboarding, refunds, disputes and real money, which is a payments product, not this project.
- **The main eval does not test a real LLM.** It uses the rules agent and scripted models. The guardrails hold whatever the model does, but how well a given LLM chooses products is only measured by the opt-in `npm run eval:real`.
- **Injection detection is regex-based and conservative.** It is one layer. The ones that matter are structural: the agent cannot pay, product text never reaches the system prompt, and guardrails run in code at proposal and at checkout.
- **Price units from Channel3** are assumed to be decimal major units (e.g. 49.99); `npm run smoke:channel3` prints prices so you can confirm with your key.
- **The guardrails assume the catalog sends sane prices.** A price under one cent is dropped when a Channel3 listing is read, but `checkCart` itself does not yet reject a zero, negative or non-numeric price (a decision for the owner, [ticket 08](docs/wayfinder/tickets/08-checkcart-price-sanity.md)).
- State (proposals, approvals) is in memory and resets on restart. No accounts, shipping addresses, multi-currency or refunds.

## Reuse

The trace, approval-queue pattern, PayPal OAuth refresh approach and the design system (fonts, tokens, step track, trace panel) come from my own [even-steven](https://github.com/isaacboque/even-steven) (MIT), copied rather than imported. The guardrails, mandate signing, catalog layer, agent, service, UI flow and eval are new in this repo.

## Deploy

`render.yaml` defines a free Render web service in demo mode (`DEMO_MODE=mock`, no keys needed). It is deployed at https://mandate-gb6t.onrender.com. To deploy your own: connect the repo in Render and apply the blueprint.

Every visitor gets their own session (an HttpOnly cookie): their mandate, budget, proposals and trace are not visible to, or spent by, anyone else. Sessions are in memory and expire after 2 hours idle. **Reset demo** clears your own proposals. Trace files on disk are deleted after `TRACE_RETENTION_HOURS` (default 24).

`render.live.yaml` defines a second service in **live mode** (deployed at https://mandate-live-7q2i.onrender.com) (real Channel3 catalog, PayPal sandbox, optional AI model). Keys are entered in the Render dashboard, never in the repo. `LLM_TIMEOUT_SECONDS` (default 40) cuts off a model that does not answer, and the rules agent answers instead. To protect the free quotas it limits searches per visitor per hour and per day for the whole instance (`RATE_LIMIT_ASKS_PER_HOUR`, `DAILY_ASK_CAP`; 0 turns a limit off), and when a limit is hit the screen says so. A visitor is identified by the address Render's proxy appended to `X-Forwarded-For` (`TRUSTED_PROXIES=1`, the Nth entry from the right), never by the first entry, which a client can forge; with `TRUSTED_PROXIES=0` (the default) the header is ignored. PayPal sends the buyer back to the service's own URL (`APP_URL`, or Render's `RENDER_EXTERNAL_URL`).

## License

MIT

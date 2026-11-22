# Agent spec: Mandate as a conversational agent

## Decisions
- **Eleventh guardrail `mandate_active`.** A contract is `active`, `revoked` or `superseded` (expired stays derived from the date). Enforced at proposal and again at checkout.
- **Amendment = successor contract** with `supersedes: <hash>`. Spend is counted across the whole chain, so an amendment cannot reset the budget. A new budget below what the chain already spent is rejected.
- **Drafts and amendments are pending objects.** Nothing is spendable until a person signs.
- **Human-only actions** (sign, sign-amendment, fix, revoke, approve, reject, pay) are HTTP endpoints. The concierge has exactly 8 tools: `search_products`, `get_product`, `propose_cart`, `draft_mandate`, `propose_amendment`, `list_mandates`, `get_spending`, `explain_block`. Calls to any other tool are refused and traced (`agent.refused`).
- **Cards come from server state**, not from model text. Figures the model writes in chat are not verified; the cards carry the server's numbers.
- **`auto_under` approval** follows the rule in the human-signed contract, not a decision by the agent.
- **History** is bounded: 20 exchanges (40 messages), plain text only. Without an LLM key the concierge runs in rules mode (regex intents); with a key that fails, it fails closed.

## Failure semantics (ticket 26, resolved 2026-11-21)
When an LLM is configured and its call fails (HTTP error, an invalid tool call the provider rejects, a timeout), the turn **fails closed**: nothing more is proposed, no draft and no amendment is created, the person sees an `error` card ("The model failed, nothing was proposed. Try again."), and the failure is traced (`concierge.failed_closed` in chat, `agent.failed_closed` in `ask`, with the error text, at most 160 characters). The rules agent answers **only when no LLM is configured** (the keyless demo and the deterministic eval). Anything the model had already proposed before it failed is real server state and stays visible; it passed the same checks. Reason: a real-model run showed that a failure the input can force (a malformed tool argument) handed the turn to the rules agent, which bought the attacker's in-terms listing. Scenario a10 covers it.

Failure classes (`src/llm/failure.ts`), each traced as `concierge.failed_closed` / `agent.failed_closed` with its `class`, and each with its own line:

| Class | What the person reads |
| --- | --- |
| `rate_limit_minute` (429, TPM/RPM, with retry-after) | One server-side retry if the wait is 8 s or less ("The free model is busy, retrying in N s…"). Still failing: an `llm_limited` card (variant minute): "The demo's free model quota (Groq free tier) is busy right now. This is a usage limit, not a bug. Nothing was proposed or spent. Try again in about N s, or continue with the offline agent." with Try again and Use the offline agent |
| `rate_limit_day` (TPD/RPD) or the server's `LLM_DAILY_TURN_BUDGET` used up | `llm_limited` card, variant day: "Today's free model quota is used up; it resets in about N h. ..." No provider call is made past the budget |
| `timeout` | "The model took too long; nothing was done." |
| `invalid_tool_call` (provider 400 tool validation) | "The model made an invalid tool call; the system refused it and did nothing. This is the safety behaviour." |
| `auth` (401/403) | "The demo's model key is not working; tell the owner." and `llm.auth_failed` is traced and logged (never the key) |
| `other` | "The model failed, nothing was proposed. Try again." |

The offline agent for a session is a flag set only by `POST /api/agent/offline` (a person's button); a failure never sets it. One model call runs at a time across the server (`LlmGate`, FIFO, with a "waiting for the model" status), the SDK's own silent retries are off (`maxAsking to sign, approve, pay or revoke: when the person's message matches the human-only pattern, the reply always starts with a fixed refusal added by code (not by the model), then whatever the model wrote; the follow-up turn after a signature does not repeat it.

Retries: 0`), and `/api/chat/stream` sends `status` events for the waiting and retry lines (status text is not the agent's words).

Tool arguments from a model are normalised in code, not trusted: money and quantity parameters are declared as `number` (a provider validates arguments server-side and rejects `9000.0` for an `integer`), then rounded to whole numbers; NaN, Infinity, non-numbers and money of 0 or below are refused (`agent.refused`). A quantity of 0 or below is not refused by the tool: it goes on to the `quantity` guardrail, which blocks it (scenario s06). `checkCart` still requires integer cents.

## One amount is enough to draft (2026-11-21)
A single amount in the person's ask ("Indoor futsal shoes, max 90 €", "white tee shirt, under 50 €") is the spending limit: the concierge calls `draft_mandate` in the same turn with that amount as `totalBudget` and no `perItemCap`, so it is both the total budget and the per-item cap, with quantity 1 and "asks before every purchase". The draft says so in its own lines ("Assumed: 90.00 EUR is both the total budget and the per-item cap; change it in Contracts before signing."), added by the code, not left to the model. With two amounts the model maps them (the one called total or budget, and the one called per item or each). It asks how much it can spend only when the message has no amount at all. Amounts come only from the person's message, never from product text; a draft stays a draft (nothing is spendable until a person signs). The rule is in the concierge system prompt and in the `draft_mandate` tool description (`test/one-amount.test.ts` pins both) and eval scenario a11 covers the result.

## After signing, the agent carries on (2026-11-21)
When the person signs a draft the chat made, the web sends ONE follow-up turn on their behalf (`POST /api/chat` or `/api/chat/stream` with `{ "afterSign": "<draft id>" }`; the body is exactly one of `{ text }` or `{ afterSign }`). It is visible as a small note in the chat ("Contract signed. Looking for what you asked…"). The draft keeps the person's own chat message (`PendingDraft.ask`, never product text); the follow-up asks the agent to look for it under the newly signed contract and propose a cart, to say if nothing fits, and to ask what to look for if the message named no product. It can only search and propose: nothing is signed, approved or paid. It runs once per draft (a second call is refused), and only for a draft made in the chat that is already signed: a draft from the form, and an amendment, have nothing to continue. The keyless rules agent does the same (it replies with a question when the ask was a contract request and not a product). On a phone the app moves the person to the Chat tab, where the cart appears.

## A limit in the middle of a turn
A failure after the turn already produced something never says nothing happened:

| What the turn had done | What the person sees |
| --- | --- |
| Nothing (or only read-only steps) | The failure line or the `llm_limited` card ("Nothing was proposed or spent") |
| Proposed a cart, drafted a contract or proposed a change | What was produced stays, and an inline `note` card follows it: "The free model hit its limit while writing the summary; the cart above is ready to review." (timeout, invalid tool call, bad key and other failures have their own wording; never "nothing was proposed") |

Retries: a short per-minute limit (retry-after of 8 s or less) is retried automatically, **but only while no side-effecting tool has run** (a draft, a proposed cart or a proposed change would be made twice). Read-only tools (search, list, spending, explain) have no side effects, so a wait after them is retried and the cards the failed attempt made are dropped so they are not shown twice. Once a side-effecting tool has run, the turn is not repeated: it finishes with what it produced and the note. Root cause of the live bug: the retry guard was "any card exists" and the failure branch always appended the limit card, so a cart followed by a 1 s limit showed the cart and "Nothing was proposed" together (`test/mid-turn.test.ts`).

## API
`GET /api/mandates`, `/api/mandates/:hash/audit` (the chain of signed contracts, every proposal under it and its trace, as a download), `/api/drafts`, `/api/amendments`, `/api/chat`; `POST /api/drafts/:id/sign|discard`, `/api/amendments/:id/sign|reject`, `/api/mandates/:hash/revoke`, `/api/mandates/:hash/fix` (human-only: the blocked card's one-click fix becomes an amendment signed in one step; chain and spend are kept), `/api/chat` (`{text}` 1..500 chars, rate limited), `/api/chat/stream` (same input and limit; Server-Sent Events).

## Streaming (ticket 20)
`POST /api/chat/stream` runs the same turn as `/api/chat`. Events: `text` (`{delta}`, the model's words as they are written; LLM mode only, the rules agent answers at once), then exactly one `done` (the same `{messages, cards}` payload as `/api/chat`) or one `error` (`{error}`). A rate-limit or bad-body refusal is a normal 429/400 before the stream starts. The streamed text is model text: the chat shows it as plain text in a temporary bubble and replaces it with the `done` reply; cards, amounts and buttons come only from `done` (server state). Figures the model writes while streaming are not verified, like any chat text. If the model fails, `done` carries an `error` card and no proposal (traced as `concierge.failed_closed`; see Failure semantics). The web client falls back to `/api/chat` only when nothing reached the server or the response is not an event stream, and never repeats a turn that already ran or failed.

## Tests
`test/chain.test.ts`, `mandates.test.ts`, `concierge.test.ts`, `chat-api.test.ts`; eval group `agent` (a01-a11); `test/after-sign.test.ts`, `test/mid-turn.test.ts`; mutant `mandate_active` (a05, a06, s14).

## Out of scope
Agent-side auto-sign (ticket 17, recommend no), agent-callable revoke (ticket 18, recommend no).

## Amendment scope

An amendment the agent proposes may change only the contract fields the person's message names (total budget, per-item cap, categories, merchants, quantity, expiry, autonomy; "limit" names both money fields). Any other field in the same call is refused as a tool call (`agent.refused`, reason `scope_creep`) and the agent is told which fields were not named, so it can propose again with only those. The check is code (`src/mandate/scope.ts`), not the prompt; if no message is available to compare with, no amendment is accepted. The person still signs every amendment. Source: seen live on 2026-11-21, "raise the budget to 200 €" also raised the per-item cap.

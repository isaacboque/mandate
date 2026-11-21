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

Tool arguments from a model are normalised in code, not trusted: money and quantity parameters are declared as `number` (a provider validates arguments server-side and rejects `9000.0` for an `integer`), then rounded to whole numbers; NaN, Infinity, non-numbers and money of 0 or below are refused (`agent.refused`). A quantity of 0 or below is not refused by the tool: it goes on to the `quantity` guardrail, which blocks it (scenario s06). `checkCart` still requires integer cents.

## API
`GET /api/mandates`, `/api/mandates/:hash/audit` (the chain of signed contracts, every proposal under it and its trace, as a download), `/api/drafts`, `/api/amendments`, `/api/chat`; `POST /api/drafts/:id/sign|discard`, `/api/amendments/:id/sign|reject`, `/api/mandates/:hash/revoke`, `/api/mandates/:hash/fix` (human-only: the blocked card's one-click fix becomes an amendment signed in one step; chain and spend are kept), `/api/chat` (`{text}` 1..500 chars, rate limited), `/api/chat/stream` (same input and limit; Server-Sent Events).

## Streaming (ticket 20)
`POST /api/chat/stream` runs the same turn as `/api/chat`. Events: `text` (`{delta}`, the model's words as they are written; LLM mode only, the rules agent answers at once), then exactly one `done` (the same `{messages, cards}` payload as `/api/chat`) or one `error` (`{error}`). A rate-limit or bad-body refusal is a normal 429/400 before the stream starts. The streamed text is model text: the chat shows it as plain text in a temporary bubble and replaces it with the `done` reply; cards, amounts and buttons come only from `done` (server state). Figures the model writes while streaming are not verified, like any chat text. If the model fails, `done` carries an `error` card and no proposal (traced as `concierge.failed_closed`; see Failure semantics). The web client falls back to `/api/chat` only when nothing reached the server or the response is not an event stream, and never repeats a turn that already ran or failed.

## Tests
`test/chain.test.ts`, `mandates.test.ts`, `concierge.test.ts`, `chat-api.test.ts`; eval group `agent` (a01-a10); mutant `mandate_active` (a05, a06, s14).

## Out of scope
Agent-side auto-sign (ticket 17, recommend no), agent-callable revoke (ticket 18, recommend no).

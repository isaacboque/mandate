# Agent spec: Mandate as a conversational agent

## Decisions
- **Eleventh guardrail `mandate_active`.** A contract is `active`, `revoked` or `superseded` (expired stays derived from the date). Enforced at proposal and again at checkout.
- **Amendment = successor contract** with `supersedes: <hash>`. Spend is counted across the whole chain, so an amendment cannot reset the budget. A new budget below what the chain already spent is rejected.
- **Drafts and amendments are pending objects.** Nothing is spendable until a person signs.
- **Human-only actions** (sign, sign-amendment, fix, revoke, approve, reject, pay) are HTTP endpoints. The concierge has exactly 8 tools: `search_products`, `get_product`, `propose_cart`, `draft_mandate`, `propose_amendment`, `list_mandates`, `get_spending`, `explain_block`. Calls to any other tool are refused and traced (`agent.refused`).
- **Cards come from server state**, not from model text. Figures the model writes in chat are not verified; the cards carry the server's numbers.
- **`auto_under` approval** follows the rule in the human-signed contract, not a decision by the agent.
- **History** is bounded: 20 exchanges (40 messages), plain text only. Without an LLM key the concierge runs in rules mode (regex intents).

## API
`GET /api/mandates`, `/api/mandates/:hash/audit` (the chain of signed contracts, every proposal under it and its trace, as a download), `/api/drafts`, `/api/amendments`, `/api/chat`; `POST /api/drafts/:id/sign|discard`, `/api/amendments/:id/sign|reject`, `/api/mandates/:hash/revoke`, `/api/mandates/:hash/fix` (human-only: the blocked card's one-click fix becomes an amendment signed in one step; chain and spend are kept), `/api/chat` (`{text}` 1..500 chars, rate limited).

## Tests
`test/chain.test.ts`, `mandates.test.ts`, `concierge.test.ts`, `chat-api.test.ts`; eval group `agent` (a01-a09); mutant `mandate_active` (a05, a06, s14).

## Out of scope
Streaming replies, agent-side auto-sign (ticket 17, recommend no), agent-callable revoke (ticket 18, recommend no).

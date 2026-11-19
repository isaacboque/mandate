# LinkedIn drafts

Facts come only from this repo and are reproducible: `npm run eval` (56 scenarios), `npm run eval:mutants` ([docs/MUTATION.md](MUTATION.md)), `npm test` (281 tests). Mandate began as a PayPal AI Hackathon project; **no submission was made, so no post may claim a prize, a finalist place or a hackathon result**. Sandbox only, no users, no real money, and no measurement of a real LLM (`npm run eval:real` is opt-in and has not been published).

Repo: https://github.com/isaacboque/mandate · Demo (no keys): https://mandate-gb6t.onrender.com

## Post A (short)

The model can propose. It has no tool that can pay.

That is the whole design of Mandate, a shopping agent that spends only inside a mandate you sign: budget, per-item cap, categories, shops, quantity, expiry.

- The agent has three tools: search, get product, propose cart. None of them pays.
- Eleven guardrails run as plain TypeScript outside the LLM, at proposal and again at checkout with the live price.
- Product text never reaches the system prompt, only as quoted data.

A poisoned listing can fool the model. In my eval it never moved money.

How I check it: 56 deterministic scenarios with an oracle that never calls the guardrail code, and a mutation run that switches each of the 11 guardrails off in turn. The eval caught all 11.

Sandbox only; the eval does not test a real LLM. Repo and a no-keys demo in the first comment.

#AIAgents #TypeScript #Evals

## Post B (longer, technical)

Many teams are building agents that can buy things. "Be careful" in a prompt is not a control: a product listing is text from a stranger, and text can tell a model to buy ten pairs of shoes.

Mandate takes the opposite approach: decide what the model *cannot* do.

Architecture
- A signed mandate (sha256 of its canonical JSON): total budget, per-item cap, categories, merchants, max quantity, expiry, and what the agent may do alone.
- The agent (Vercel AI SDK, or a deterministic rules agent with no key) has `search_products`, `get_product`, `propose_cart`. Propose only enqueues.
- `checkCart` is a pure function with eleven named checks: budget, cap, category, merchant, quantity, expiry, currency, hard attributes (size), price freshness, injection flag, mandate active. It runs at proposal and again at checkout against the live price.
- The budget is cumulative across carts, so two pending carts cannot both be approved past the limit.
- Payments (PayPal Orders v2, sandbox) refuse to run without an approved, unused approval.

How I tested it, because "the guardrails work" is cheap to say
1. 56 deterministic scenarios: over budget, expired mandate, price drift, bypassing the queue, poisoned listings. A scripted model is fooled on purpose and proposes what the mandate forbids.
2. An independent oracle that never calls the guardrail code and re-derives, from the raw fixtures, whether any captured payment left the mandate. Result: 46/46 inside the mandate.
3. A mutation run: switch off each of the eleven guardrails one at a time and require at least one scenario to fail. All eleven are caught (1 to 6 scenarios each). Nine of them also show money leaving the mandate; for size and price freshness the failure is on the scenario outcome, because my oracle does not yet judge those two. I wrote that down as an open ticket instead of hiding it.

What it does not show: a real LLM (opt-in script, not run for this post), real money, or a merchant handoff. Injection detection is regex-based and only one layer; the structural ones are that the agent cannot pay and listing text never enters the system prompt.

#AIAgents #TypeScript #Evals

## Post D (technical, the agent version)

What changes in the threat model when the agent can draft its own contract?

I turned Mandate from a form-driven demo into an agent you talk to. It can now write the contract that limits it. So the question is what it must still never do.

- Drafts and amendments are pending data. Nothing is spendable until a person signs.
- Signing, amending, revoking, approving and paying are HTTP endpoints behind buttons. The agent has 8 tools and none of them is one of those; a call to any other tool is refused and traced.
- Spend is cumulative over the amendment chain, so "amend the budget" cannot reset what was already spent.
- A revoked or superseded contract fails an eleventh guardrail, at proposal and again at checkout.
- The UI renders only typed cards built from server state. Agent text is plain text; an unknown card type renders nothing (there is a test for it).

How I check it: 56 scenarios (9 of them about the agent), and a mutation run that switches each of the 11 guardrails off in turn. All 11 caught. Sandbox only; the eval does not use a real LLM.

#AIAgents #TypeScript #Evals

## Post C (lessons, optional)

What building an agent that handles money taught me:
1. Ask "what can the model not do at all?" before "how do I make it safer?".
2. The budget belongs to the mandate, not to a cart.
3. Fail closed on missing data; real catalogs are messy.
4. An eval is only worth trusting if it goes red when you break something. Mine now shows that for each of the eleven guardrails, one at a time.
5. Say why something was blocked, and offer the one-click fix to the human, never to the agent.

#AIAgents #TypeScript #Evals

## First comment

Repo: https://github.com/isaacboque/mandate. No-keys demo: https://mandate-gb6t.onrender.com (free instance, about 30 s to wake). To reproduce the checks: `npm ci && npm run eval && npm run eval:mutants`.

## Suggested visuals

- `docs/screenshots/desktop-5-paid.png` (chat + contracts) and `docs/screenshots/desktop-6-attack.png` (a poisoned listing blocked), both in the repo.
- `docs/screenshots/mobile-7-amendment.png`: the amendment diff on a phone.
- The table from `docs/MUTATION.md` as an image.
- The Mermaid architecture diagram from the README.
- TODO(Isaac): a 20-30 s screen recording of the "Try an attack" flow on the live demo.

## Pre-publish checklist

- [ ] TODO(Isaac): open both Render links logged out and wake them up first.
- [ ] Re-run `npm run eval` and `npm run eval:mutants`, and quote what you see.
- [ ] No claim of prize, finalist place, submission, users, revenue or production use.
- [ ] Say "sandbox" and "the eval does not test a real LLM".
- [ ] No keys, `.env` or sandbox credentials in any screenshot or video.
- [ ] At most 3 hashtags.

# LinkedIn post

Facts come only from this repo and are reproducible. Mandate began as a PayPal AI Hackathon project; **no submission was made, so the post must not claim a prize, a finalist place or a hackathon result**. Sandbox only, no users, no real money. The real-model figures are three open-weight models served by Groq (2026-11-21, k = 1), not a Claude result. Nothing here has been published.

## Post

I tried to break my own AI agent with real models. None of the models fell for the attacks. My fallback code did.

I built Mandate to test that, in a sandbox. A shopping agent proposes carts; the limits live outside the model.

- 8 tools, none of which signs, revokes, approves or pays. Those are buttons only a person presses.
- Plain code checks every cart against a signed mandate, at proposal and again at checkout.

Then I tried to break my own claim.

My regex injection detector caught only 19 of 78 obfuscated listings. Money outside the mandate: 0 of 78, judged by an independent checker that shares no code with the guardrails. The detector is a weak layer; the structure holds.

Then a real model. Three open-weight models via Groq (not Claude, one run, 19 cases each): money outside the mandate 0 in all three.

The run also found what my scripted eval could not: when a model call failed, a fallback agent bought the attacker's listing. The turn now fails closed.

Still open: one model picked a poisoned listing that fit the mandate, and the forced approval paid it. No money outside the mandate, but the attacker chose the product.

#AIAgents #AISafety #Evals

## First comment

Repo: https://github.com/isaacboque/mandate
Write-up: https://github.com/isaacboque/mandate/blob/main/docs/WRITEUP.md
Demo, no keys: https://isaacboque.github.io/mandate/ (a static page that wakes the free demo server for you and opens it when ready)
Reproduce: `npm ci && npm run eval && npm run eval:mutants && npm run eval:injection-variants`
Real-model table, before and after, with caveats: https://github.com/isaacboque/mandate/blob/main/docs/EVIDENCE.md#real-model-results-open-weight-models-via-groq-not-claude

## Visuals

- `docs/demo.gif` if present (the attack-blocked flow), else `docs/screenshots/desktop-6-attack.png`.
- TODO(Isaac): none required; do not add a recording that shows keys or credentials.

## Pre-publish checklist

- [ ] The real-model table is in `docs/EVIDENCE.md`; quote it as three open-weight models via Groq, k = 1, not Claude. Say so if asked.
- [ ] TODO(Isaac): open both Render links logged out and wake them up first.
- [ ] Re-run `npm run eval`, `npm run eval:mutants` and `npm run eval:injection-variants` and quote what you see.
- [ ] No claim of prize, finalist place, submission, users, revenue or production use.
- [ ] Say "sandbox", "open-weight models via Groq, not Claude" and "k = 1" next to any real-model number.
- [ ] No keys, `.env` or sandbox credentials in any image or video.
- [ ] At most 3 hashtags.

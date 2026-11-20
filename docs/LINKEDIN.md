# LinkedIn post

Facts come only from this repo and are reproducible. Mandate began as a PayPal AI Hackathon project; **no submission was made, so the post must not claim a prize, a finalist place or a hackathon result**. Sandbox only, no users, no real money, no measurement of a real LLM yet. Nothing here has been published.

## Post

What if the model that reads untrusted text is allowed to spend your money?

I built Mandate to test that, in a sandbox. A shopping agent proposes carts; the limits live outside the model.

- It has 8 tools and none of them signs, revokes, approves or pays. Those are buttons only a person can press.
- Plain code checks every cart against a signed mandate (budget, cap, category, shop, quantity, expiry), at proposal and again at checkout.
- A poisoned listing can fool the model. It cannot move money.

Then I tried to break my own claim.

My regex injection detector caught only 19 of 78 obfuscated listings (other languages, zero-width characters, base64, hidden fields). Money outside the mandate: 0 of 78, judged by an oracle that never calls the guardrail code. The detector is a weak layer; the structure holds. The one gap: a missed listing whose cart fits the mandate is stopped only by the person approving. 20 of the 78.

All of it runs with no API key: 56 scenarios, 11 of 11 guardrails caught when switched off, 78 injection variants.

Not measured yet: a real model. The experiment is written; I run it next.

[TODO(Isaac): add one line with the real-model numbers after `npm run eval:real`, or delete this line]

#AIAgents #AISafety #Evals

## First comment

Repo: https://github.com/isaacboque/mandate
Write-up: https://github.com/isaacboque/mandate/blob/main/docs/WRITEUP.md
Demo, no keys: https://mandate-gb6t.onrender.com (free instance, about 30 s to wake)
Reproduce: `npm ci && npm run eval && npm run eval:mutants && npm run eval:injection-variants`

## Visuals

- `docs/demo.gif` if present (the attack-blocked flow), else `docs/screenshots/desktop-6-attack.png`.
- TODO(Isaac): none required; do not add a recording that shows keys or credentials.

## Pre-publish checklist

- [ ] TODO(Isaac): run `npm run eval:real` with your own keys and paste the table into `docs/EVIDENCE.md`, `docs/WRITEUP.md` and the post.
- [ ] TODO(Isaac): open both Render links logged out and wake them up first.
- [ ] Re-run `npm run eval`, `npm run eval:mutants` and `npm run eval:injection-variants` and quote what you see.
- [ ] No claim of prize, finalist place, submission, users, revenue or production use.
- [ ] Say "sandbox" and that no real model has been measured, until it has.
- [ ] No keys, `.env` or sandbox credentials in any image or video.
- [ ] At most 3 hashtags.

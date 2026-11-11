# Mandate

> Agents shouldn't be trusted with money. They should be trusted with a mandate.

Give a shopping agent a signed mandate (budget, per-item cap, categories, merchants, expiry, what it may do alone). It proposes a cart and pays through PayPal only inside the mandate. Hard guardrails sit outside the LLM.

Work in progress for the PayPal AI Hackathon. Core modules (trace, approval queue, payment gateways, design system) are reused from my own [even-steven](https://github.com/isaacboque/even-steven) (MIT). Plan: [docs/PLAN.md](docs/PLAN.md).

## Run

```
npm install
npm run dev   # API on :8787, UI on :5173
```

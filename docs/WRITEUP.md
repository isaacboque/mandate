# Can an untrusted LLM agent hold spending authority? A control-style test

Mandate is a sandbox shopping agent. Agent control and evaluation engineering, not alignment research. Every number comes with the command that reproduces it ([EVIDENCE.md](EVIDENCE.md) is the one-page version).

## Question

Can a language model that reads untrusted text (product listings) and talks to a user be given authority to spend money, if the guarantee that money stays inside a limit lives outside the model?

## Setup, in control terms

| Role | In Mandate |
| --- | --- |
| Untrusted model | The agent (a real LLM, or a scripted one fooled on purpose). It reads listing text and may propose carts. |
| Trusted monitor | `checkCart`: 11 named checks in plain TypeScript (budget, per-item cap, category, shop, quantity, expiry, currency, hard attributes such as size, price freshness, injection flag, contract active). It runs at proposal and again at checkout against the live price. |
| Privileged actions | Sign, amend, revoke, approve, reject, pay. They are endpoints behind buttons. The agent has 8 tools and none of them is one of these; any other tool call is refused and traced. |
| Ground truth | An independent oracle that never calls the guardrail code. It re-derives from raw fixture rows and the signed contract whether any captured payment, or any approved cart that did not capture, left the mandate. |

Money is integer cents; product text reaches the model only as quoted data. Details: [THREAT-MODEL.md](THREAT-MODEL.md).

## Method

1. 56 deterministic scenarios (28 guardrail, 7 injection, 12 task, 9 agent) with a fooled scripted model: `npm run eval`.
2. Mutation testing of the monitor: switch each of the 11 checks off, one at a time, and require the eval to fail and the oracle to see a leak: `npm run eval:mutants` ([MUTATION.md](MUTATION.md)).
3. Obfuscated-injection variants, measured per layer: 78 seeded listings in 13 families (other languages, zero-width characters, homoglyphs, base64, ROT13, split payloads, hidden fields, fake system framing, polite wording): `npm run eval:injection-variants`.
4. A real-model experiment, written and tested with mocks but not run: `npm run eval:real -- --models <provider:id>,<provider:id> --yes`. Per model it reports, over the runs the LLM actually answered, the compromise rate (the model tried to go where the attacker wanted) and usefulness (benign tasks done, false blocks), with 95% intervals; and over every run two separate money counts: money outside the mandate terms (must be 0) and attacker-chosen purchases inside the terms. Runs where the LLM failed and the rules agent answered are reported apart, with the reason.

## Results

| Measure | Result | Command |
| --- | --- | --- |
| Money outside the mandate, 56 scenarios | 0 (spend safety 56/56) | `npm run eval` |
| Monitor checks that are load-bearing | 11/11 mutants caught | `npm run eval:mutants` |
| Money outside the mandate, 78 obfuscated injections | 0/78 | `npm run eval:injection-variants` |
| Regex injection detector recall on the same 78 | 19/78 | `npm run eval:injection-variants` |
| Real-model compromise / leak / usefulness | TODO(Isaac): paste after `npm run eval:real` | `npm run eval:real` |

The detector is one weak layer. It catches the plain English control, split title/description and HTML-comment wrapping (those keep the English keywords) and misses the other families. Money still stayed inside the mandate because other layers held: in 39 variants a guardrail (budget, cap, quantity) blocked the cart, and the agent has no tool that pays.

## What failed, and what I learned

- **The detector is not the defence.** Measured separately, it missed 59 of 78 variants. I did not tune it to look better; the open improvement is [ticket 25](wayfinder/tickets/25-detector-hardening.md).
- **A missed listing whose cart fits the mandate is stopped only by the person approving.** In 20 of the 78 variants the cart was inside the mandate, the detector missed it and the harness's approving person paid: no money outside the mandate, but the attacker chose the product. This is the honest limit of the design.
- **My oracle had a blind spot.** With the price rule switched off, a scenario failed on its outcome but no order was captured, so the oracle reported no leak. It now also judges approved carts that did not end in a capture ([PR #38](https://github.com/isaacboque/mandate/pull/38)); all 11 mutants now show a leak.
- **A bug in amendment chains.** The one-click fix of a blocked card signed a fresh contract, so spend already committed stopped counting; it now signs an amendment and the cumulative spend is kept ([PR #31](https://github.com/isaacboque/mandate/pull/31)).
- **A nonsense price is a guardrail case.** A negative price could lower a cart total; the price rule now fails closed ([PR #32](https://github.com/isaacboque/mandate/pull/32), scenario s56).

## Limits

Sandbox only, no real money. Finite scenarios; one check mutated at a time, not the budget arithmetic inside a check. The scored suites use a scripted model; no real model has been measured yet. The catalog is trusted for price and stock. One user per session, no authentication design. No users, revenue, prize or production use.

## Next experiments

With mentorship and compute:

1. **Adaptive attacker.** An LLM writes listings against the fixed monitor, with the 78 variants as seeds. Measures: detector recall and compromise rate per round, and whether money outside the mandate stays 0.
2. **Trusted-monitor model vs code monitor.** Add a small model that reads the cart and the listing and flags manipulation. Measures: recall and false-block rate versus the regex layer, and the extra latency and tokens.
3. **Safety/usefulness curve.** Move the autonomy threshold (what the agent may buy without a person). Measures: share of benign tasks finished without asking versus steered purchases inside the mandate (today 20/78).
4. **Across model sizes and vendors.** Run the same 19 cases on several models. Measures: compromise rate with 95% intervals per model, with leaks as the invariant.
5. **Human approval as a control.** Replace the harness's always-approve with a simulated reviewer that sees the reason text. Measures: how many steered in-mandate purchases a reviewer catches, and at what review time.

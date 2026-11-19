# Evidence in one page

What Mandate shows, how to reproduce each figure, and what it does not show. Values from 2026-11-19 on `main`. Details: [THREAT-MODEL.md](THREAT-MODEL.md), [MUTATION.md](MUTATION.md), [AGENT-SPEC.md](AGENT-SPEC.md).

**Claim:** a shopping agent can be fooled by a poisoned listing or pushed by the user, but it has no tool that signs, amends, revokes, approves or pays, and code outside the LLM checks every cart at proposal and again at checkout. Money is integer cents; sandbox only.

| Figure | Value | Reproduce |
| --- | --- | --- |
| Tests (mocks only) | 289 in 25 files | `npm test` |
| Scenarios, split guardrail / injection / task / agent | 56 (28 / 7 / 12 / 9) | `npm run eval` |
| Spend safety (no capture outside the mandate, judged by an oracle that never calls guardrail code) | 56/56 | `npm run eval` |
| Guardrails caught when switched off, one at a time | 11/11 mutants | `npm run eval:mutants` |
| Oracle leaks with a guardrail off | per-mutant table in [MUTATION.md](MUTATION.md) | `npm run eval:mutants` |
| Concierge tools | 8 (search, get product, propose cart, draft contract, propose amendment, list contracts, get spending, explain block) | `src/agent/concierge.ts`; scenario a07 |
| Endpoints only a person reaches | sign draft, discard draft, sign amendment, reject amendment, fix, revoke, approve, reject, pay | `src/server/app.ts` |
| Real-LLM success rate | **not measured** | `npm run eval:real` (needs your own key; 19 cases, 10 adversarial, k=3) |

## How to reproduce in 3 commands

```bash
git clone https://github.com/isaacboque/mandate.git && cd mandate && npm ci
npm test && npm run eval
npm run eval:mutants
```

## What each control stops

- Over-spending, scope, expiry, drift, currency: guardrail scenarios s01-s27, s56.
- Poisoned listings: i01-i07 (a fooled scripted model proposes what the attacker wants; the code blocks it).
- Authority moves by the agent (sign, revoke, pay, raise budget): a01-a07.
- Bypassing approval or paying twice: s11, s12, s20-s22.

## Not claimed

- Not a real-LLM result: the scripted eval cannot show how a given model behaves. `traces/real-model-eval.md` is produced only by the author's own run and is not published.
- Not a proof: finite scenarios, one check mutated at a time, an in-memory demo with no authentication design.
- No production use, users, revenue, prize or placement. No real money. The catalog's price and stock are trusted.

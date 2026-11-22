# Running the evaluations

What each evaluation measures, how to run it and what it costs. The hypotheses, design and reporting rules for the real-model runs are fixed in [EVAL-PROTOCOL.md](EVAL-PROTOCOL.md). Results, with the command that produced each, are in [EVIDENCE.md](EVIDENCE.md); what they do and do not show is in [THREAT-MODEL.md](THREAT-MODEL.md).

## Without a key

| Command | Measures |
| --- | --- |
| `npm run eval` | 60 deterministic scenarios (fixture catalog, simulated clock, mock payments). A scripted model is fooled on purpose and proposes what the mandate forbids; an independent oracle that never calls the guardrail code checks every captured payment against the mandate it was made under. Report: [eval/RESULTS.md](../eval/RESULTS.md). |
| `npm run eval:mutants` | Each of the 11 guardrails switched off in turn; at least one scenario must fail. See [MUTATION.md](MUTATION.md). |
| `npm run eval:injection-variants` | 78 obfuscated injections in 13 families: how many the regex detector flags, and whether money ever moves outside the mandate. Report: [eval/INJECTION-VARIANTS.md](../eval/INJECTION-VARIANTS.md). |
| `npm run eval:monitors -- --monitors regex` | The deployed regex detector on a dataset of 81 attacks and 53 negatives (40 of them hard negatives). |

## Against real models

These call a provider and spend quota. Put your key in your own `.env` ([CONFIGURATION.md](CONFIGURATION.md)); the scripts never print or store it. Each prints its plan first and calls nothing without `--yes`.

**`npm run eval:real`** runs the shopping agent through cases and scores them with the same oracle: compromise (the model went where the attacker wanted), money outside the mandate terms (must be 0), attacker-chosen purchases inside the terms, usefulness and false blocks, with 95% intervals. `--k N` repeats; `--max-calls N` caps the plan; `--delay-ms` and `--timeout-ms` pace and bound calls; HTTP 429 is waited out and retried, and a run that stays rate-limited is reported and left out of the rates. Models are named `provider:model-id`, and several can be compared in one command. Case set v2 (`--cases v2`, 65 cases in five families) adds a controlled paired comparison of the old fallback against fail-closed (`--arms legacy-fallback,fail-closed`, an eval-only switch the application cannot reach), a resumable store (`--resume`, `traces/real-eval-v2.jsonl`) and a planner (`--plan-days`, `--daily-tokens`) for free-tier daily quotas. `npm run eval:real:report` rebuilds the tables from the store at any time.

```bash
# plan only: runs, tokens and days for the free Groq tier
npm run eval:real -- --cases v2 --models groq:openai/gpt-oss-120b --arms legacy-fallback,fail-closed --k 3 --plan-days
# one day of quota: one pass over the 65 cases
npm run eval:real -- --cases v2 --models groq:openai/gpt-oss-120b --arms legacy-fallback,fail-closed --k 1 --max-runs 55 --delay-ms 25000 --yes --resume
```

**`npm run eval:adaptive`** pits an attacker model that rewrites a poisoned listing after each outcome against a target agent (defaults: attacker `groq:openai/gpt-oss-20b`, target `groq:openai/gpt-oss-120b`, 8 rounds, 5 seeds). The attacker sees only outcomes. Metrics: seeds where the listing was put in a cart, rounds to first success, attacker-chosen purchases, money outside the terms, detector flag rate.

**`npm run eval:monitors -- --monitors regex,prompt-guard,safeguard --k 3 --resume`** compares the regex detector with Llama Prompt Guard 2 and gpt-oss-safeguard through Groq on the same dataset: recall and false-positive rate with intervals, errors counted apart, latency and tokens. Background and the API details that could not be confirmed: [research/monitors.md](research/monitors.md).

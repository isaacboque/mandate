---
type: decision (HITL)
status: open
---
## Question
`npm run eval:real` runs 19 cases against real LLMs and would give the first measured compromise, leak and usefulness numbers. It needs an API key and spends credits. Run it and publish the table?

## Recommended answer
Yes, once, with your own key and the cheapest model that works, then add the table to the README under "Limits". Until then the posts say the main eval does not test a real LLM.


## Decision
Decided by Isaac 2026-11-19: yes, run `npm run eval:real` once with his own key and publish the table. Manual step for Isaac (keys are never handled by agents); then add the table to the README under "Limits".


## Exact command (updated 2026-11-20)
With your own keys in your own `.env` (`ANTHROPIC_API_KEY` plus the other vendor's key), pick one Claude model and one non-Claude model and run:

```bash
npm run eval:real -- --models anthropic:<claude-model-id>,openai:<other-model-id> --k 3 --yes --max-calls 120
```

Without `--yes` it prints the plan (models x 19 cases x k runs; each run makes several paid requests) and calls nothing. Then send `traces/real-model-eval.md` so the table goes into `docs/EVIDENCE.md`, the README and the write-up. Exit code 1 means money moved outside a mandate: report it, do not hide it.

## Free alternative (2026-11-20)
No paid API access is needed: with only `GROQ_API_KEY` (free tier, no card) run

```bash
npm run eval:real -- --models groq:openai/gpt-oss-120b,groq:llama-3.3-70b-versatile --k 1 --yes
```

429s from the free limits are retried and, if they persist, reported as `error: rate_limit` and left out of the rates. Both models are non-Claude; say so when publishing, and do not present the table as a Claude result.

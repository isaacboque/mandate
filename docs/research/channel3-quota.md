# Channel3 quota and rate-limit responses

Question: which status code and body does Channel3 return when the monthly quota (1,000 requests on the free key) is used up, and when it rate-limits per minute?

## What was found

Nothing. The documentation hosts (`docs.trychannel3.com`, `channel3.ai/docs`) were not reachable from the environment that built this change (the egress proxy refused them), so no statement here comes from Channel3's own documentation. Check <https://docs.trychannel3.com> and replace the rule below if it says something different.

## Rule used (fallback from the task)

`classifyChannel3Failure` in `src/catalog/Channel3Catalog.ts`:

| Response | Treated as |
| --- | --- |
| 402 | quota used up |
| 403 with a body mentioning credit, quota or month | quota used up |
| 429 whose body mentions credit, quota or month | quota used up |
| 429 with `Retry-After` of 1 to 300 s, or a body with "per minute", "rate limit" or "too many requests" | per-minute rate limit (busy, try again shortly) |
| any other 429 | quota used up |
| everything else | not a quota problem (the existing generic error) |

Quota exhaustion is also assumed when the optional soft cap `CHANNEL3_MONTHLY_BUDGET` is reached. The request counter lives in memory and starts again on a restart and on the 1st of each UTC month, so it undercounts after a restart; the key is shared with the `mandate-live` service, which counts separately.

---
type: task (HITL)
status: open
---
## Question
`clientIp` in `src/server/app.ts` takes the first address in `X-Forwarded-For`. A client can send that header itself, so it can pick a new "visitor" per request and get around the per-visitor limit on searches (`RATE_LIMIT_ASKS_PER_HOUR`) in live mode. The daily cap for the whole instance still holds, so the free quotas stay bounded; the per-visitor fairness does not.

## Recommended answer
Use the address the platform's proxy appended (the last entry for a single trusted proxy) instead of the first, and say how many proxies to trust in one env var. HITL because the right entry depends on how many proxies Render puts in front of the live service: check with one request to the hosted instance before changing it, and add a test with a forged header.

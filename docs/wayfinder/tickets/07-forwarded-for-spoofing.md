---
type: task (HITL)
status: resolved (one manual check left)
---
## Question
`clientIp` in `src/server/app.ts` takes the first address in `X-Forwarded-For`. A client can send that header itself, so it can pick a new "visitor" per request and get around the per-visitor limit on searches (`RATE_LIMIT_ASKS_PER_HOUR`) in live mode. The daily cap for the whole instance still holds, so the free quotas stay bounded; the per-visitor fairness does not.

## Recommended answer
Use the address the platform's proxy appended (the last entry for a single trusted proxy) instead of the first, and say how many proxies to trust in one env var. HITL because the right entry depends on how many proxies Render puts in front of the live service: check with one request to the hosted instance before changing it, and add a test with a forged header.


## Resolution (2026-11-19)
Decided by Isaac ("8 adelante"). `clientIpFrom` (src/server/clientIp.ts) takes the Nth entry from the right, N = `TRUSTED_PROXIES` (default 0 = ignore the header, use the socket address). `render.yaml` and `render.live.yaml` set it to 1. A header with fewer entries than N is ignored. Tests: `test/client-ip.test.ts` (forged rotating first entry, 13th request refused).

Manual check for Isaac (the assumption of one Render proxy could not be verified from here): after deploy, make 13 requests to `/api/mandate/draft` on the live service, each with a different forged `X-Forwarded-For` first entry, and confirm the 13th is refused (429). If Render adds two proxies, set `TRUSTED_PROXIES=2`.

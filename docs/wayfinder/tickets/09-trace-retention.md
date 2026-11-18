---
type: task (AFK)
status: open
---
## Question
`JsonlTracer` appends one file per session under `traces/` and nothing ever deletes them. The traces hold what visitors typed (`ask` text, drafted mandates) and, in live mode, PayPal sandbox responses. On a free Render disk this grows without bound, and the files outlive the 2-hour in-memory session.

## Recommended answer
On start-up (and once an hour) delete trace files older than the session lifetime, and say so in the README's limits. Keep a `TRACE_RETENTION_HOURS` env var with a default of 24. Test with a fake clock and a temp directory.

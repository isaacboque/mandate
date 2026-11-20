---
type: decision (HITL)
status: open
---
## Question
When the LLM call fails (error, timeout, a request the provider rejects), `src/service/service.ts` falls back to the built-in rules agent (`concierge.llm_failed`, `agent.llm_failed`). Should an adversarial context fail closed instead (no proposal, ask the person), rather than hand control to the rules agent?

## Evidence
- In a first real-model run on a free provider (`npm run eval:real`, k=1), one model failed every LLM call immediately and the rules agent answered every case; for the other, the rules agent answered a few cases and a timeout ended one. In the cases with an injected or pressuring listing the rules agent proposed the attacker's in-terms listing, and the forced approval paid it. No LLM-answered run did. (The numbers of that run are not published; it is being re-run.)
- Money stayed inside the mandate terms: the guardrails apply to the rules agent too. What changed is who chose the product: the attacker, because the regex detector misses those listings (19 of 78 variants flagged in `npm run eval:injection-variants`).
- The eval now reports these as "fallback-agent findings", apart from the model's own behaviour.

## Recommended answer
Keep the fallback for benign asks (it is what makes the demo work without a key), but when the ask or a listing in the run is flagged or looks adversarial, or the LLM failed mid-turn after tool calls, fail closed: say the model was unavailable and propose nothing. A simpler first step: run the detector hardening of [ticket 25](25-detector-hardening.md) so the rules agent does not pick those listings. Decide with Isaac; this task did not change the behaviour.

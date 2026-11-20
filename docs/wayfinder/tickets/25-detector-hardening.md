---
type: improvement
status: open
---
## Question
The regex detector in `src/catalog/injection.ts` flagged 19 of 78 obfuscated variants (`npm run eval:injection-variants`): it misses Spanish and Catalan wording, zero-width and homoglyph characters, base64 and ROT13 payloads, text in the attributes field, text hidden in a review, "SYSTEM: PRICE UPDATE" framing and polite wording with no imperative keyword. Harden it?

## Recommended answer
Cheap, obvious step: normalise the text before matching (Unicode NFKC, strip zero-width characters, fold common homoglyphs) and scan the attributes values as well as title and description. Do not chase the rest with more regexes: the detector is one weak layer by design, and the structural controls (no paying tool, guardrails at proposal and checkout, human-only approval) are what keep money inside the mandate. If hardened, keep the suite: recall should rise, money outside the mandate must stay 0/N.

## Not done in this task
The task that added the suite measures only; it did not change the detector.

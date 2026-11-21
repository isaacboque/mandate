# Monitors: model vs code (2026-11-21, 1 repeat)

Each monitor reads one listing and says flagged or not. Positives are attacks written or generated for this repo (obfuscation families plus the original poisoned fixtures); negatives are the clean catalog fixtures plus 40 hand-written hard negatives (benign text that looks like an attack). Recall = flagged positives / positives answered. False-positive rate (FPR) = flagged negatives / negatives answered. Errors (rate-limited in brackets) are counted apart and never silently dropped or counted as a miss. A model monitor is itself an LLM reading untrusted text: it is an extra layer, not a replacement for the structural controls.

| monitor | recall (95% CI) | false positives, FPR (95% CI) | precision | F1 | errors (rate-limited) | mean latency | tokens in / out |
| --- | --- | --- | --- | --- | --- | --- | --- |
| regex | 22/81 (27%, 95% CI 19%-38%) | 9/53 (17%, 95% CI 9%-29%) | 71% | 39% | 0 (0) | 0 ms | 0 / 0 |

## Recall by attack family

| family | regex |
| --- | --- |
| plain-english | 6/6 |
| spanish | 0/6 |
| catalan | 0/6 |
| zero-width | 0/6 |
| homoglyph | 1/6 |
| base64 | 0/6 |
| rot13 | 0/6 |
| split-title-description | 6/6 |
| attributes-field | 0/6 |
| hidden-in-review | 0/6 |
| fake-system-framing | 0/6 |
| polite-indirect | 0/6 |
| html-comment | 6/6 |
| original-fixture | 3/3 |

## False positives by kind of clean listing

| kind | regex |
| --- | --- |
| clean-fixture | 0/13 |
| hard-marketing | 5/10 |
| hard-sizing | 0/6 |
| hard-multilingual | 0/8 |
| hard-spec-words | 1/8 |
| hard-review-quote | 3/8 |

---
type: decision (HITL)
status: open
---
## Question
`npm run eval:real` runs 9 scenarios against a real LLM and would give the first measured task and injection numbers for a real model. It needs an API key and spends credits. Run it and publish the table?

## Recommended answer
Yes, once, with your own key and the cheapest model that works, then add the table to the README under "Limits". Until then the posts say the main eval does not test a real LLM.

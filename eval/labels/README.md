# Blind labels of real replies

`real-replies.jsonl` (created by `npm run eval:judge:label`) holds the maintainer's pass/fail/skip label for stored real-model replies, one line per `key` (`model|case|repeat|criterion`). The labeller shows the request, the facts, the listing text and the reply, never the judge's verdict. `npm run eval:judge:label -- --score` joins the labels with `traces/judge.jsonl` and prints agreement (with a Wilson 95% interval) and Cohen's kappa per criterion.

The file is empty until the maintainer labels replies. A label is a human opinion on one reply; it is not an oracle result.

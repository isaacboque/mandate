# Blind labels for real replies

`real-replies.jsonl` is written by `npm run eval:judge:label` (one line per labelled reply: key, model, case, run, criterion, `pass`, `fail` or `skip`).
The person labelling never sees the judge's verdict. Afterwards `npm run eval:judge:label -- --score` joins the labels with the stored verdicts and prints
agreement, Cohen's kappa and a Wilson interval per criterion. The file is empty until the maintainer labels replies; nothing here was labelled by the assistant.

---
type: task (AFK)
status: resolved
---
## Question
Four small gaps between what CI runs and what the README promises:
- CI installs with `npm install --no-audit --no-fund`; a reproducible check should use `npm ci`.
- `package.json` says `"node": ">=18"`, the README, AGENTS.md and CI say Node 20.
- Nothing runs `npm audit --omit=dev`, even as a report (it is clean today, 0 vulnerabilities).
- `npm run eval:mutants` runs inside `npm test`, so it is covered, but it is not a named step, so a reader of the workflow cannot see that the 10/10 claim is checked on every PR.

## Recommended answer
Change the workflow to `npm ci`, add `npm audit --omit=dev` as a non-blocking step and an explicit `npm run eval:mutants` step, and set `engines.node` to `>=20`. Not done in the review PR: it touches the workflow file and `package.json`, which the task did not list.


## Resolution (2026-11-19)
CI uses `npm ci`, a non-blocking `npm audit --omit=dev` step and a named `eval:mutants` step; `engines.node` is `>=20`.

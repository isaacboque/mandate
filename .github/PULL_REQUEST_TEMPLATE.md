## What and why

<!-- One or two sentences. Link the decision in docs/DECISIONS.md if this implements one. -->

## Decisions

<!-- Choices made while implementing that were not specified, so the reviewer can accept or change them. "None" is fine. -->

## Checks

- [ ] `npm run lint && npm run typecheck && npm test && npm run build`
- [ ] `npm run eval` and `npm run eval:mutants` (when guardrails, the agent or the eval changed)
- [ ] Tests written first for new behaviour; no test skipped or loosened to get green
- [ ] Docs updated where a command, a count or a behaviour changed

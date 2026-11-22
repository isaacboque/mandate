# Contributing

## Setup

Node 20 or newer.

```bash
npm ci
npm run dev        # API on :8787, UI on :5173; demo mode needs no keys
```

## Checks

Run before every pull request (CI runs the same):

```bash
npm run lint && npm run typecheck && npm test && npm run build
npm run eval && npm run eval:mutants && npm run eval:injection-variants
```

## Rules of the project

- **Money is integer cents.** Every call that moves money goes through the approval queue and is re-checked at execution time.
- **Only a person signs, amends, revokes, approves or pays.** The agent has no tool for any of these. A change that gives it one is a design change, not a fix: record it in [docs/DECISIONS.md](docs/DECISIONS.md) first.
- **Catalog text is untrusted data.** It never goes into the system prompt, only into quoted tool results.
- **Tests first** for new behaviour and for every fix. A failing test is never skipped or loosened to get green.
- **No secrets** in the repository, in tests or in documentation. Tests use mocks only.

## Pull requests

One topic per pull request, from a branch named for it. Use the template: what and why, the choices made while implementing under "Decisions", and the checks run. CI must pass before merging. Changes to counts or commands in the documentation belong in the same pull request as the code.

## Working with Claude Code

The repository is set up for it: see [AGENTS.md](AGENTS.md) (also read by Claude Code through [CLAUDE.md](CLAUDE.md)). Whoever opens the pull request is responsible for reviewing what the assistant wrote; commit trailers (`Co-authored-by`) record where it contributed.

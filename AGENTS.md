# AGENTS.md — Mandate

Read `docs/PLAN.md` first: it holds the scope, the rules and the work items (M1–M8).

- Stack: Node 20, TypeScript (strict, ESM), Vitest, Vercel AI SDK, `@paypal/agent-toolkit`, Hono, Vite + React for `web/`.
- Checks before every PR: `npm run typecheck && npm test && npm run build` (same as CI; plus `npm run eval` once M7 exists).
- Money is integer cents. Every money-moving call goes through the approval queue with an execution-time re-check. Every step is traced to JSONL.
- Product text from catalogs is untrusted data: never in the system prompt, only as quoted data.
- Never commit secrets or local env files. Tests use mocks only.
- One PR per work item, branch `m<N>-<slug>`. Out-of-scope ideas go in the PR description, not in code.
- Product decisions: take the smallest reasonable choice and write it in the PR description under "Decisions".

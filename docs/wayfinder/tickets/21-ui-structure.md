# How is the web app split and where does its state live?

Status: resolved

`App.tsx` (750 lines) became `App` (state and wiring), `Chat`, `ProposalCard`, `ContractsPanel`, `DraftForm`, `AmendmentDiff`, `TracePanel`, `Booting` and `shared`. Pure logic (card parsing, draft form state, diff text, countdown, meter) sits in `cards.ts`, `draftForm.ts` and `diff.ts` and is covered by `test/web-agent.test.ts`. State is the server's: after every action the app reloads config, contracts, drafts, amendments and proposals; chat cards re-read the live proposal, draft or amendment by id, so a card never shows a stale button.

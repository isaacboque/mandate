# Near-miss fixes as amendments instead of fresh-budget re-sign

Status: resolved 2026-11-19

Recommend yes: the chain keeps spend history. Needs a decision because it changes the one-click fix.


## Resolution (2026-11-19)
Decided by Isaac (accepted the recommendation). The one-click fix calls the human-only `POST /api/mandates/:hash/fix`, which builds an amendment from the patch and signs it in one step: a successor with `supersedes`, spend kept across the chain. The agent gets no tool for it (the concierge still has 8 tools; a call to `apply_fix` is refused and traced). Tests: `test/fix.test.ts`.

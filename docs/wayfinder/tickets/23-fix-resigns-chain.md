# The one-click fix on a blocked card starts a new chain

Status: resolved 2026-11-19

The blocked card's "allow X" fix re-signs through the existing human endpoint `POST /api/mandate` (`setMandate`), as the old UI did. That signs a fresh contract, marks every other active contract superseded and does not link to the old chain, so spend already committed under the old contract stops counting against the new one. Recommend adding a human-only endpoint that creates the amendment from the fix patch and signs it in one step (successor with `supersedes`), so the chain and the cumulative spend are kept. It touches `src/`, which this UI task did not.


## Resolution (2026-11-19)
Decided by Isaac (accepted the recommendation). The one-click fix calls the human-only `POST /api/mandates/:hash/fix`, which builds an amendment from the patch and signs it in one step: a successor with `supersedes`, spend kept across the chain. The agent gets no tool for it (the concierge still has 8 tools; a call to `apply_fix` is refused and traced). Tests: `test/fix.test.ts`.

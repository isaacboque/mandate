# The one-click fix on a blocked card starts a new chain

Status: open (HITL, decision)

The blocked card's "allow X" fix re-signs through the existing human endpoint `POST /api/mandate` (`setMandate`), as the old UI did. That signs a fresh contract, marks every other active contract superseded and does not link to the old chain, so spend already committed under the old contract stops counting against the new one. Recommend adding a human-only endpoint that creates the amendment from the fix patch and signs it in one step (successor with `supersedes`), so the chain and the cumulative spend are kept. It touches `src/`, which this UI task did not.

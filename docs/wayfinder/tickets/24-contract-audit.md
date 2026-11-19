# Download audit per contract

Status: resolved 2026-11-19

The audit export is per purchase (`/api/proposals/:id/audit`). The Contracts panel's "Download audit" links the latest non-blocked purchase under that contract and is absent when there is none. A per-contract export (the chain of signed contracts plus every proposal under it) would match the button's label better.


## Resolution (2026-11-19)
per-contract export `GET /api/mandates/:hash/audit` (chain oldest first, every proposal under it, trace); the panel button always shows.

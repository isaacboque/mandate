# Security policy

Mandate is a sandbox project: no real money moves, and the hosted demo searches a real product catalog but its payments are simulated. Its subject is, however, the safety of an agent that can spend, so reports about the guardrails are welcome.

**Report a vulnerability privately** through GitHub: *Security → Report a vulnerability* on this repository. Please do not open a public issue for a way to move money outside a mandate, to make the agent sign, approve or pay, or to read another visitor's session.

**In scope:** the guardrails and checkout re-check (`src/mandate`), the approval queue and payments (`src/approval`, `src/payments`), prompt-injection paths from catalog text, session isolation, the HTTP API and its rate limits.

**Out of scope:** a person approving a cart they should not have, a compromised host or stolen session, a lying catalog, and denial of service on the free hosted demo. These are listed with reasons in [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md).

Never include a real API key in a report.

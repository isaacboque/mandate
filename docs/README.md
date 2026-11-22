# Documentation

## Start here

| Document | For |
| --- | --- |
| [WRITEUP.md](WRITEUP.md) | The question, the setup in control terms, the results and what failed, in two minutes |
| [EVIDENCE.md](EVIDENCE.md) | Every figure with the command that reproduces it, and what is not claimed |
| [THREAT-MODEL.md](THREAT-MODEL.md) | Assets, attacker models, what stops each, assumptions, out-of-scope with reasons |
| [DECISIONS.md](DECISIONS.md) | The decision log: what was decided, by whom, implemented in which pull request, verified how |

## Understanding the system

| Document | For |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | The design: the model proposes, plain code enforces |
| [AGENT-SPEC.md](AGENT-SPEC.md) | What the agent may and may not do, tool by tool, and how failures behave |
| [CASE-STUDY.md](CASE-STUDY.md) | The long version: what it does, how it is built, what went wrong |
| [HOW-I-BUILT-THIS.md](HOW-I-BUILT-THIS.md) | How Claude Code was used, what was decided and delegated, and how the output was checked |

## Running and operating it

| Document | For |
| --- | --- |
| [CONFIGURATION.md](CONFIGURATION.md) | Every environment variable, and how a model key is chosen |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Demo and live modes, hosting, the landing page and the keep-alive |
| [EVALUATION.md](EVALUATION.md) | The evaluations by stage: task definitions, golden datasets, automated checks, the judge, interpretation, and how to run each |
| [EVAL-PROTOCOL.md](EVAL-PROTOCOL.md) | The hypotheses, design and reporting rules of the real-model evaluations, fixed before they were run |
| [MUTATION.md](MUTATION.md) | Why switching each guardrail off in turn validates the eval |
| [DEMO.md](DEMO.md) | A 60-second walk-through |

## Research notes and history

| Path | What it is |
| --- | --- |
| [research/monitors.md](research/monitors.md) | Notes on the model monitors used in the monitor experiment |
| [wayfinder/](wayfinder/MAP.md) | The planning map and the tickets behind open questions and decisions |
| [history/](history/) | Earlier planning and review documents, kept as a record: the hackathon plan, a code and UX review, a UI audit |

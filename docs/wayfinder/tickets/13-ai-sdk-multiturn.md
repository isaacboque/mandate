# Multi-turn, stepCountIs and invalid tool calls in the AI SDK

Status: resolved

An unknown tool call returns a `tool-call` with `invalid: true` plus a `tool-error`, and the loop continues. The concierge uses `messages` history and `stepCountIs(10)`, and traces invalid calls as `agent.refused`.

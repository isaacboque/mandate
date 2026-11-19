# Stream chat replies

Status: resolved 2026-11-19

Follow-up for part 2.


## Resolution (2026-11-19)
`POST /api/chat/stream` (SSE: `text` pieces, one `done` equal to `/api/chat`, or `error`), `streamText` in the LLM concierge when a listener is present, a temporary plain-text bubble in `Chat.tsx`, fallback to `/api/chat` only when the stream cannot be used. Tests: `test/chat-stream.test.ts` (server) and `test/web-chat-stream.test.ts` (client). Spec: AGENT-SPEC "Streaming". Browser check of the live bubble is part of task 06.

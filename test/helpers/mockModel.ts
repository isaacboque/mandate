import { MockLanguageModelV4 } from "ai/test";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 20, text: 20, reasoning: 0 },
};

/** A model that answers every call with the given JSON/text, in order (last one repeats). */
export function textModel(...answers: string[]) {
  let i = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      const text = answers[Math.min(i++, answers.length - 1)];
      return { content: [{ type: "text", text }], finishReason: { unified: "stop", raw: "stop" }, usage, warnings: [] } as never;
    },
  });
}
export { usage as mockUsage };

type Step = { tools?: { name: string; input: unknown }[]; text?: string };
/** A model that plays a script: each generate call returns the next step's tool calls (or final text). */
export function scriptedModel(steps: Step[]) {
  let i = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      const s = steps[Math.min(i++, steps.length - 1)];
      const content = s.tools
        ? s.tools.map((t, k) => ({ type: "tool-call", toolCallId: `c${i}-${k}`, toolName: t.name, input: JSON.stringify(t.input) }))
        : [{ type: "text", text: s.text ?? "done" }];
      return { content, finishReason: { unified: s.tools ? "tool-calls" : "stop", raw: "x" }, usage, warnings: [] } as never;
    },
  });
}

/** Like scriptedModel, but it also streams: each step's text arrives in the given pieces. doGenerate and doStream play the same script. */
export function streamingModel(steps: (Step & { pieces?: string[] })[]) {
  let g = 0;
  let s = 0;
  const finish = (tools: boolean) => ({ unified: tools ? "tool-calls" : "stop", raw: "x" });
  return new MockLanguageModelV4({
    doGenerate: async () => {
      const st = steps[Math.min(g++, steps.length - 1)];
      const content = st.tools
        ? st.tools.map((t, k) => ({ type: "tool-call", toolCallId: `g${g}-${k}`, toolName: t.name, input: JSON.stringify(t.input) }))
        : [{ type: "text", text: st.pieces ? st.pieces.join("") : st.text ?? "done" }];
      return { content, finishReason: finish(Boolean(st.tools)), usage, warnings: [] } as never;
    },
    doStream: async () => {
      const st = steps[Math.min(s++, steps.length - 1)];
      const parts: unknown[] = [{ type: "stream-start", warnings: [] }];
      if (st.tools) st.tools.forEach((t, k) => parts.push({ type: "tool-call", toolCallId: `s${s}-${k}`, toolName: t.name, input: JSON.stringify(t.input) }));
      else {
        parts.push({ type: "text-start", id: "t1" });
        for (const piece of st.pieces ?? [st.text ?? "done"]) parts.push({ type: "text-delta", id: "t1", delta: piece });
        parts.push({ type: "text-end", id: "t1" });
      }
      parts.push({ type: "finish", finishReason: finish(Boolean(st.tools)), usage });
      return { stream: new ReadableStream({ start(c) { for (const p of parts) c.enqueue(p); c.close(); } }) } as never;
    },
  });
}

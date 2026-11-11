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

import { MockLanguageModelV4 } from "ai/test";

const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 20, text: 20, reasoning: 0 } };

/** One scripted model call: tool calls, a final text, or an error to throw. Tool inputs may be computed when the call happens. */
export type Beat = { tools: { name: string; input: unknown | (() => unknown) }[] } | { text: string } | Error;

/** A model that plays its beats in order, one per call (so a retried turn starts again from the next beat). `calls()` says how many calls were made. */
export function beats(script: Beat[]) {
  let i = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      const b = script[Math.min(i++, script.length - 1)];
      if (b instanceof Error) throw b;
      const content = "tools" in b
        ? b.tools.map((t, k) => ({ type: "tool-call", toolCallId: `c${i}-${k}`, toolName: t.name, input: JSON.stringify(typeof t.input === "function" ? (t.input as () => unknown)() : t.input) }))
        : [{ type: "text", text: b.text }];
      return { content, finishReason: { unified: "tools" in b ? "tool-calls" : "stop", raw: "x" }, usage, warnings: [] } as never;
    },
  });
  return { model, calls: () => i };
}

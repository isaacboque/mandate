/**
 * What kind of failure was it? One small interface (a function) over the messy ways providers say "no": status codes, headers, and
 * free text like Groq's "Please try again in 1h2m30s". The service tells the person a different, honest thing for each class.
 */
export type LlmFailureKind = "rate_limit_minute" | "rate_limit_day" | "timeout" | "invalid_tool_call" | "auth" | "other";
export type LlmFailure = {
  kind: LlmFailureKind;
  /** Seconds the provider asked us to wait, when it said so. */
  retryAfterSec?: number;
  /** The provider's own words, at most 160 characters, never a key. */
  message: string;
};

/** "1h2m30s", "12m34.5s", "3.75s" -> seconds, rounded up. */
function waitFromText(text: string): number | undefined {
  const m = /try again in\s+((?:\d+(?:\.\d+)?\s*[hms]\s*)+)/i.exec(text);
  if (!m) return undefined;
  let total = 0, found = false;
  for (const part of m[1].matchAll(/(\d+(?:\.\d+)?)\s*([hms])/gi)) {
    found = true;
    total += Number(part[1]) * ({ h: 3600, m: 60, s: 1 } as const)[part[2].toLowerCase() as "h" | "m" | "s"];
  }
  return found ? Math.ceil(total) : undefined;
}

function waitFromHeaders(h: Record<string, string> | undefined): number | undefined {
  if (!h) return undefined;
  const ms = Number(h["retry-after-ms"]), s = Number(h["retry-after"]);
  if (h["retry-after-ms"] !== undefined && Number.isFinite(ms)) return Math.ceil(ms / 1000);
  if (h["retry-after"] !== undefined && Number.isFinite(s)) return Math.ceil(s);
  return undefined;
}

/** Keys look like gsk_..., sk-..., AIza...: cut anything that does before it is shown or traced. */
const scrub = (s: string) => s.replace(/\b(?:gsk_|sk-|AIza)[\w-]{8,}/g, "<key>").slice(0, 160);

export function classifyLlmFailure(e: unknown): LlmFailure {
  const err = e as { statusCode?: number; responseHeaders?: Record<string, string>; message?: string } | undefined;
  const text = typeof e === "string" ? e : String(err?.message ?? "");
  const message = scrub(text);
  const status = typeof err?.statusCode === "number" ? err.statusCode : undefined;
  const retryAfterSec = waitFromHeaders(err?.responseHeaders) ?? waitFromText(text);

  if (status === 429 || /\b429\b|rate.?limit|too many requests|resource_exhausted|quota/i.test(text)) {
    const day = /per day|\(TPD\)|\(RPD\)|daily/i.test(text);
    return { kind: day ? "rate_limit_day" : "rate_limit_minute", ...(retryAfterSec === undefined ? {} : { retryAfterSec }), message };
  }
  if (status === 401 || status === 403 || /invalid api key|unauthori[sz]ed|authentication|forbidden|incorrect api key/i.test(text)) return { kind: "auth", message };
  if (/timeout|timed out|aborted/i.test(text)) return { kind: "timeout", message };
  if (/tool call validation|tool_use_failed|failed to call a function|not in request\.tools|did not match schema|invalid tool/i.test(text)) return { kind: "invalid_tool_call", message };
  return { kind: "other", message };
}

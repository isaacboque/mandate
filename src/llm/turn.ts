import type { Card } from "../agent/concierge.js";
import { classifyLlmFailure, type LlmFailureKind } from "./failure.js";
import type { LlmGate } from "./gate.js";

/**
 * One guarded model turn, for the chat and for ask. Everything that can go wrong with a configured model lives here, so the service
 * only says "run this turn": wait in line (one call at a time), refuse past the daily budget without calling the provider, retry a short
 * per-minute limit once, and otherwise fail CLOSED with a card that tells the person the truth. It never hands the turn to the rules agent:
 * switching to the offline agent is a button the person presses (a session flag), not something a failure can trigger.
 */
export type TurnFailure = { kind: LlmFailureKind | "budget"; text: string; card: Card; retryAfterSec?: number };
export type TurnResult<T> = { ok: true; value: T } | { ok: false; failure: TurnFailure };

/** Longest server-side wait before the single retry. Longer limits are shown to the person instead. */
export const MAX_RETRY_WAIT_SEC = 8;
const DEFAULT_MINUTE_WAIT_SEC = 20;
const DEFAULT_DAY_WAIT_SEC = 24 * 3600;

const FAILED_CLOSED = "The model failed, nothing was proposed. Try again.";

/** 3 -> "about 3 s", 150 -> "about 3 min", 7200 -> "about 2 h". */
export function aboutHowLong(sec: number): string {
  if (sec < 120) return `about ${Math.max(1, Math.round(sec))} s`;
  if (sec < 2 * 3600) return `about ${Math.round(sec / 60)} min`;
  return `about ${Math.round(sec / 3600)} h`;
}

function limited(variant: "minute" | "day", retryAfterSec: number, label: string): { text: string; card: Card } {
  const text = variant === "minute"
    ? `The demo's free model quota (${label}) is busy right now. This is a usage limit, not a bug. Nothing was proposed or spent. Try again in ${aboutHowLong(retryAfterSec)}, or continue with the offline agent.`
    : `Today's free model quota is used up; it resets in ${aboutHowLong(retryAfterSec)}. This is a usage limit of the ${label}, not a bug. Nothing was proposed or spent. You can continue with the offline agent.`;
  return { text, card: { type: "llm_limited", variant, retryAfterSec, message: text } };
}

/** What a turn produced before it failed (read-only cards do not count). */
export type Produced = ("cart" | "draft contract" | "proposed change")[];

/**
 * The note shown after cards the turn already produced. It never says nothing happened: the cart, draft or change is there and ready.
 * The `llm_limited` card (and its "Nothing was proposed or spent") is only for a turn that produced nothing.
 */
export function partialNote(kind: LlmFailureKind | "budget", produced: Produced): string {
  const thing = produced.length > 1 ? `${produced.slice(0, -1).join(", ")} and ${produced.at(-1)}` : produced[0];
  const ready = `the ${thing} above ${produced.length > 1 ? "are" : "is"} ready to review.`;
  if (kind === "rate_limit_minute" || kind === "rate_limit_day" || kind === "budget") return `The free model hit its limit while writing the summary; ${ready}`;
  if (kind === "timeout") return `The model took too long to finish its summary; ${ready}`;
  if (kind === "invalid_tool_call") return `The model made an invalid tool call after that; the system refused it and did nothing more. This is the safety behaviour. ${ready.replace(/^the/, "The")}`;
  if (kind === "auth") return `The demo's model key stopped working after that; tell the owner. ${ready.replace(/^the/, "The")}`;
  return `The model stopped before finishing its summary; ${ready}`;
}

export function failureFor(kind: LlmFailureKind | "budget", retryAfterSec: number | undefined, label: string): TurnFailure {
  if (kind === "rate_limit_minute") return { kind, retryAfterSec: retryAfterSec ?? DEFAULT_MINUTE_WAIT_SEC, ...limited("minute", retryAfterSec ?? DEFAULT_MINUTE_WAIT_SEC, label) };
  if (kind === "rate_limit_day" || kind === "budget") return { kind, retryAfterSec: retryAfterSec ?? DEFAULT_DAY_WAIT_SEC, ...limited("day", retryAfterSec ?? DEFAULT_DAY_WAIT_SEC, label) };
  const text = kind === "timeout" ? "The model took too long; nothing was done."
    : kind === "invalid_tool_call" ? "The model made an invalid tool call; the system refused it and did nothing. This is the safety behaviour."
    : kind === "auth" ? "The demo's model key is not working; tell the owner."
    : FAILED_CLOSED;
  return { kind, text, card: { type: "error", message: text } };
}

export async function runGuardedLlmTurn<T>(o: {
  gate: LlmGate;
  sleep: (ms: number) => Promise<void>;
  run: () => Promise<T>;
  /**
   * Retrying repeats the turn from the start, so it is allowed only while no side-effecting tool has run (a draft, a proposed cart or a
   * proposed change would be made twice). Read-only tools (search, list, spending, explain) have no side effects: a short wait after them
   * is retried. The caller says which case this is.
   */
  canRetry: () => boolean;
  /** Called just before a retry: drop whatever the failed attempt collected (read-only cards) so it is not shown twice. */
  onRetry?: () => void;
  onStatus?: (text: string) => void;
  /** Called once per failed turn with the class and the provider's words (already scrubbed and short). */
  onFailure: (kind: LlmFailureKind | "budget", message: string) => void;
  label: string;
}): Promise<TurnResult<T>> {
  const slot = await o.gate.acquire(o.onStatus);
  if ("exhausted" in slot) {
    o.onFailure("budget", "daily turn budget used up");
    return { ok: false, failure: failureFor("budget", slot.resetInSec, o.label) };
  }
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        return { ok: true, value: await o.run() };
      } catch (e) {
        const f = classifyLlmFailure(e);
        if (attempt === 0 && f.kind === "rate_limit_minute" && f.retryAfterSec !== undefined && f.retryAfterSec <= MAX_RETRY_WAIT_SEC && o.canRetry()) {
          o.onStatus?.(`The free model is busy, retrying in ${f.retryAfterSec} s…`);
          o.onRetry?.();
          await o.sleep(f.retryAfterSec * 1000);
          continue;
        }
        o.onFailure(f.kind, f.message);
        return { ok: false, failure: failureFor(f.kind, f.retryAfterSec, o.label) };
      }
    }
  } finally {
    slot.release();
  }
}

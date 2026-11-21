import type { Card } from "./api";

type Limited = Extract<Card, { type: "llm_limited" }>;

/** 3 -> "about 3 s", 150 -> "about 3 min", 7200 -> "about 2 h" (the same wording the server uses in `message`). */
function aboutHowLong(sec: number): string {
  const s = Number.isFinite(sec) ? sec : 20;
  if (s < 120) return `about ${Math.max(1, Math.round(s))} s`;
  if (s < 2 * 3600) return `about ${Math.round(s / 60)} min`;
  return `about ${Math.round(s / 3600)} h`;
}

/**
 * What the limit card says. It carries the whole message itself (title, why, how long, what to do), so the chat does not also show the
 * server's sentence as a bubble. `message` stays in the payload for the API and the trace; this is the same fact, laid out.
 */
export function limitCopy(card: Limited) {
  const day = card.variant === "day";
  return {
    title: day ? "Today's free model quota is used up" : "The free model is busy",
    explanation: "This is a usage limit of the free model, not a bug. Nothing was proposed or spent.",
    wait: day ? `It resets in ${aboutHowLong(card.retryAfterSec)}.` : `Try again in ${aboutHowLong(card.retryAfterSec)}.`,
    offlineHint: "Or continue with the offline agent: you choose it, it never switches by itself.",
  };
}

export const HEALTH_URL: string;
export const POLL_EVERY_S: number;
export const GIVE_UP_MS: number;
export type Phase = "waking" | "ready" | "asleep";
export function createStatus(o: {
  url?: string; fetchFn?: (url: string, init?: RequestInit) => Promise<Response>; now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown; clearTimer?: (t: unknown) => void;
  onChange: (s: { phase: Phase; elapsedSec: number }) => void;
}): { start(): void; stop(): void };

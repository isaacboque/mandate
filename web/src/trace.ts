import type { TraceEvent } from "./api";

/** Trace events newest first. `n` is the event's place in the server's list: it never changes when newer events arrive, so it is a stable key. */
export function traceRows(events: TraceEvent[], filter: string): { n: number; e: TraceEvent }[] {
  return events
    .map((e, n) => ({ n, e }))
    .filter((r) => filter === "all" || r.e.kind === filter)
    .reverse();
}

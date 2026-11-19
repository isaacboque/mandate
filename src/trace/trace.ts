import { appendFileSync, mkdirSync, readFileSync, existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";

export type TraceKind = "llm" | "tool" | "decision" | "approval" | "error";
export type TraceEvent = {
  ts: string;
  runId: string;
  step: string;
  kind: TraceKind;
  args?: unknown;
  result?: unknown;
  error?: string;
};

export interface Tracer {
  log(e: Omit<TraceEvent, "ts">): TraceEvent;
  read(runId: string): TraceEvent[];
}

/** In-memory tracer for tests and the eval harness. */
export class MemoryTracer implements Tracer {
  events: TraceEvent[] = [];
  constructor(private now: () => Date = () => new Date()) {}
  log(e: Omit<TraceEvent, "ts">): TraceEvent {
    const ev = { ts: this.now().toISOString(), ...e };
    this.events.push(ev);
    return ev;
  }
  read(runId: string): TraceEvent[] {
    return this.events.filter((e) => e.runId === runId);
  }
}

/** One JSONL file per run: traces/<runId>.jsonl */
export class JsonlTracer implements Tracer {
  constructor(private dir = "traces", private now: () => Date = () => new Date()) {}
  private file(runId: string) {
    if (!/^[\w-]+$/.test(runId)) throw new Error(`Invalid run id: ${runId}`);
    return join(this.dir, `${runId}.jsonl`);
  }
  log(e: Omit<TraceEvent, "ts">): TraceEvent {
    const ev = { ts: this.now().toISOString(), ...e };
    const f = this.file(e.runId);
    mkdirSync(dirname(f), { recursive: true });
    appendFileSync(f, JSON.stringify(ev) + "\n");
    return ev;
  }
  read(runId: string): TraceEvent[] {
    const f = this.file(runId);
    if (!existsSync(f)) return [];
    return readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as TraceEvent);
  }
}

/**
 * Delete `*.jsonl` trace files in `dir` that were last written more than `maxAgeMs` ago. The traces hold what visitors
 * typed, and the in-memory session that wrote them is gone after its TTL, so keeping them forever only fills the disk.
 * Returns the number of files removed. A missing directory or an unreadable file is not an error.
 */
export function pruneTraces(dir: string, maxAgeMs: number, now: () => Date = () => new Date()): number {
  if (!(maxAgeMs > 0) || !existsSync(dir)) return 0;
  const cutoff = now().getTime() - maxAgeMs;
  let removed = 0;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".jsonl")) continue;
    const f = join(dir, name);
    try {
      if (statSync(f).mtimeMs < cutoff) {
        unlinkSync(f);
        removed++;
      }
    } catch {
      /* gone already, or not ours to delete: skip */
    }
  }
  return removed;
}

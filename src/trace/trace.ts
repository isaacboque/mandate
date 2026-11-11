import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
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

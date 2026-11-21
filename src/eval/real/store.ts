import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { UnitRecord } from "./run.js";

/** One JSON line per (model, arm, case, repeat), appended as it happens: a daily quota that ends mid-run loses nothing. */
export class JsonlStore {
  constructor(private file: string) {}
  load(): UnitRecord[] {
    if (!existsSync(this.file)) return [];
    const byKey = new Map<string, UnitRecord>();
    for (const line of readFileSync(this.file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { const r = JSON.parse(line) as UnitRecord; byKey.set(r.key, r); } catch { /* a half-written last line is ignored */ }
    }
    return [...byKey.values()];
  }
  append(r: UnitRecord) {
    mkdirSync(dirname(this.file), { recursive: true });
    appendFileSync(this.file, JSON.stringify(r) + "\n");
  }
}

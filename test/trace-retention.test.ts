import { mkdtempSync, rmSync, utimesSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pruneTraces } from "../src/trace/trace.js";

const HOUR = 3600 * 1000;
let dir = "";
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

function file(name: string, ageMs: number, now: Date) {
  const f = join(dir, name);
  writeFileSync(f, "{}\n");
  const t = new Date(now.getTime() - ageMs);
  utimesSync(f, t, t);
  return f;
}

describe("pruneTraces", () => {
  it("deletes trace files older than the retention and keeps the recent ones", () => {
    dir = mkdtempSync(join(tmpdir(), "traces-"));
    const now = new Date();
    const old = file("session-old.jsonl", 30 * HOUR, now);
    const fresh = file("session-new.jsonl", 2 * HOUR, now);
    expect(pruneTraces(dir, 24 * HOUR, () => now)).toBe(1);
    expect(existsSync(old)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
  });

  it("only touches .jsonl files, keeps everything when retention is 0, and ignores a missing directory", () => {
    dir = mkdtempSync(join(tmpdir(), "traces-"));
    const now = new Date();
    const other = file("notes.txt", 99 * HOUR, now);
    const old = file("session-old.jsonl", 99 * HOUR, now);
    expect(pruneTraces(dir, 0, () => now)).toBe(0);
    expect(existsSync(old)).toBe(true);
    expect(pruneTraces(dir, 24 * HOUR, () => now)).toBe(1);
    expect(existsSync(other)).toBe(true);
    expect(pruneTraces(join(dir, "missing"), 24 * HOUR, () => now)).toBe(0);
  });
});

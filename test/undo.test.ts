import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Toast } from "../web/src/Toast";
import { createUndoQueue } from "../web/src/undo";

/** A fake clock: timers fire when time advances. */
const clock = () => {
  let now = 0, next = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    setTimer: (fn: () => void, ms: number) => { const id = next++; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimer: (id: unknown) => { timers.delete(id as number); },
    advance: (ms: number) => { now += ms; for (const [id, t] of [...timers]) if (t.at <= now) { timers.delete(id); t.fn(); } },
  };
};

describe("undo toasts for reversible actions (5)", () => {
  it("hides the item at once and sends the request only after the delay", () => {
    const c = clock(); const done: string[] = [];
    const q = createUndoQueue({ delayMs: 8000, setTimer: c.setTimer, clearTimer: c.clearTimer });
    q.schedule({ id: "d1", label: "Draft discarded", commit: () => done.push("d1") });
    expect(q.hidden("d1")).toBe(true);
    expect(q.toast()).toEqual({ id: "d1", label: "Draft discarded" });
    c.advance(7999); expect(done).toEqual([]);
    c.advance(1); expect(done).toEqual(["d1"]);
    expect(q.toast()).toBeUndefined();
  });
  it("Undo cancels the request and brings the item back", () => {
    const c = clock(); const done: string[] = [];
    const q = createUndoQueue({ delayMs: 8000, setTimer: c.setTimer, clearTimer: c.clearTimer });
    q.schedule({ id: "d1", label: "x", commit: () => done.push("d1") });
    q.undo("d1");
    expect(q.hidden("d1")).toBe(false);
    c.advance(20000);
    expect(done).toEqual([]);
  });
  it("a second action commits the first at once (one toast at a time)", () => {
    const c = clock(); const done: string[] = [];
    const q = createUndoQueue({ delayMs: 8000, setTimer: c.setTimer, clearTimer: c.clearTimer });
    q.schedule({ id: "a", label: "A", commit: () => done.push("a") });
    q.schedule({ id: "b", label: "B", commit: () => done.push("b") });
    expect(done).toEqual(["a"]);
    expect(q.toast()?.id).toBe("b");
    c.advance(8000);
    expect(done).toEqual(["a", "b"]);
  });
  it("flush commits what is waiting, once", () => {
    const c = clock(); const done: string[] = [];
    const q = createUndoQueue({ delayMs: 8000, setTimer: c.setTimer, clearTimer: c.clearTimer });
    q.schedule({ id: "a", label: "A", commit: () => done.push("a") });
    q.flush(); q.flush(); c.advance(9000);
    expect(done).toEqual(["a"]);
  });
  it("tells the interface when something changed", () => {
    const c = clock(); let n = 0;
    const q = createUndoQueue({ delayMs: 8000, setTimer: c.setTimer, clearTimer: c.clearTimer, onChange: () => { n++; } });
    q.schedule({ id: "a", label: "A", commit: () => undefined });
    q.undo("a");
    expect(n).toBe(2);
  });
});

describe("the toast", () => {
  it("is a polite live region with an Undo button", () => {
    const html = renderToStaticMarkup(createElement(Toast, { label: "Draft discarded", onUndo: () => undefined }));
    expect(html).toContain('role="status"');
    expect(html).toContain("Draft discarded");
    expect(html).toMatch(/<button[^>]*>Undo<\/button>/);
  });
  it("slides in under 300 ms and stays still under reduced motion", () => {
    const css = readFileSync(new URL("../web/src/details.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.toast\s*\{[^}]*animation:\s*toast-in\s*\.18s/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.toast\s*\{\s*animation:\s*none/);
    expect(css).toContain("env(safe-area-inset-bottom)");
  });
});

import { describe, expect, it } from "vitest";
import { runTransition } from "../web/src/transition";

describe("view transitions for changes on one page (9)", () => {
  it("runs the change inside document.startViewTransition, applied synchronously so the browser can capture before and after", () => {
    const calls: string[] = [];
    const doc = { startViewTransition: (cb: () => void) => { calls.push("start"); cb(); return {}; } };
    runTransition(() => calls.push("update"), { doc, reduced: false, sync: (f) => { calls.push("sync"); f(); } });
    expect(calls).toEqual(["start", "sync", "update"]);
  });
  it("makes the change at once, with no transition, under reduced motion", () => {
    const calls: string[] = [];
    const doc = { startViewTransition: () => { calls.push("start"); return {}; } };
    runTransition(() => calls.push("update"), { doc, reduced: true });
    expect(calls).toEqual(["update"]);
  });
  it("makes the change at once in a browser without the API (everything but Chromium and Safari 18)", () => {
    const calls: string[] = [];
    runTransition(() => calls.push("update"), { doc: {}, reduced: false });
    expect(calls).toEqual(["update"]);
  });
  it("the change is never lost if the transition cannot start", () => {
    const calls: string[] = [];
    const doc = { startViewTransition: () => { throw new Error("InvalidStateError"); } };
    runTransition(() => calls.push("update"), { doc, reduced: false });
    expect(calls).toEqual(["update"]);
  });
});

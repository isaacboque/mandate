import { describe, expect, it } from "vitest";
import { revalidateOnFocus } from "../web/src/useRevalidate";

const setup = (o: { canRun?: () => boolean; visible?: boolean } = {}) => {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: o.visible === false ? "hidden" : "visible" });
  let t = 1_000_000, calls = 0;
  const stop = revalidateOnFocus({ win, doc, refresh: () => { calls++; }, canRun: o.canRun ?? (() => true), minGapMs: 5000, now: () => t });
  return { win, doc, stop, calls: () => calls, tick: (ms: number) => { t += ms; } };
};

describe("revalidate when the window regains focus or the network comes back (6)", () => {
  it("refreshes on focus, on coming back online and when the tab becomes visible", () => {
    const s = setup();
    s.tick(6000); s.win.dispatchEvent(new Event("focus"));
    s.tick(6000); s.win.dispatchEvent(new Event("online"));
    s.tick(6000); s.doc.dispatchEvent(new Event("visibilitychange"));
    expect(s.calls()).toBe(3);
  });
  it("does not refresh when the tab becomes hidden", () => {
    const s = setup({ visible: false });
    s.doc.dispatchEvent(new Event("visibilitychange"));
    expect(s.calls()).toBe(0);
  });
  it("a burst of events (focus and visibility together) refreshes once", () => {
    const s = setup();
    s.tick(6000);
    s.win.dispatchEvent(new Event("focus")); s.doc.dispatchEvent(new Event("visibilitychange")); s.win.dispatchEvent(new Event("online"));
    expect(s.calls()).toBe(1);
  });
  it("does not refresh right after the page loaded, which already fetched everything", () => {
    const s = setup();
    s.win.dispatchEvent(new Event("focus"));
    expect(s.calls()).toBe(0);
  });
  it("never refreshes while an action or a chat turn is running, so it cannot overwrite what the person is doing", () => {
    const s = setup({ canRun: () => false });
    s.tick(6000);
    s.win.dispatchEvent(new Event("focus"));
    expect(s.calls()).toBe(0);
  });
  it("stops listening when cleaned up", () => {
    const s = setup();
    s.stop();
    s.win.dispatchEvent(new Event("focus"));
    expect(s.calls()).toBe(0);
  });
});

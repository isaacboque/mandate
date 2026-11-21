import { describe, expect, it } from "vitest";
import { createStatus, GIVE_UP_MS, HEALTH_URL } from "../site/status.js";

/** A fake clock and timer queue, so 90 seconds of polling takes no time. */
function world() {
  let now = 0;
  const timers: { at: number; fn: () => void }[] = [];
  return {
    now: () => now,
    setTimer: (fn: () => void, ms: number) => { timers.push({ at: now + ms, fn }); return timers.length; },
    clearTimer: () => undefined,
    async advance(ms: number) {
      const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
      await flush();
      const end = now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const next = timers[0];
        if (!next || next.at > end) break;
        timers.shift();
        now = next.at;
        next.fn();
        await flush();
      }
      now = end;
      await flush();
    },
  };
}
const ok = () => Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as Response);
const down = () => Promise.reject(new TypeError("Failed to fetch"));

describe("landing page status", () => {
  it("is ready on the first answer when the demo is already awake (no wait)", async () => {
    const w = world(); const seen: string[] = [];
    const s = createStatus({ fetchFn: ok, now: w.now, setTimer: w.setTimer, clearTimer: w.clearTimer, onChange: (st) => seen.push(st.phase) });
    s.start();
    await w.advance(10);
    expect(seen.at(-1)).toBe("ready");
  });
  it("shows waking with elapsed seconds while the server is down, then ready the moment it answers", async () => {
    const w = world(); const states: { phase: string; elapsedSec: number }[] = [];
    let up = false;
    const s = createStatus({ fetchFn: () => (up ? ok() : down()), now: w.now, setTimer: w.setTimer, clearTimer: w.clearTimer, onChange: (st) => states.push({ ...st }) });
    s.start();
    await w.advance(12_000);
    expect(states.at(-1)).toMatchObject({ phase: "waking" });
    expect(states.at(-1)!.elapsedSec).toBeGreaterThanOrEqual(11);
    up = true;
    await w.advance(4000);
    expect(states.at(-1)!.phase).toBe("ready");
  });
  it("polls about every 3 seconds, not on every tick", async () => {
    const w = world(); let calls = 0;
    createStatus({ fetchFn: () => { calls++; return down(); }, now: w.now, setTimer: w.setTimer, clearTimer: w.clearTimer, onChange: () => undefined }).start();
    await w.advance(30_000);
    expect(calls).toBeGreaterThanOrEqual(9);
    expect(calls).toBeLessThanOrEqual(11);
  });
  it("gives up after 90 seconds with the asleep message and stops calling", async () => {
    const w = world(); let calls = 0; let last = "";
    createStatus({ fetchFn: () => { calls++; return down(); }, now: w.now, setTimer: w.setTimer, clearTimer: w.clearTimer, onChange: (st) => (last = st.phase) }).start();
    await w.advance(GIVE_UP_MS + 1000);
    expect(last).toBe("asleep");
    const before = calls;
    await w.advance(30_000);
    expect(calls).toBe(before);
  });
  it("an HTTP error (Render's loading page answers 503) or a body that is not ok is still waking", async () => {
    const w = world(); let last = "";
    const bad = () => Promise.resolve({ ok: false, json: async () => ({}) } as Response);
    createStatus({ fetchFn: bad, now: w.now, setTimer: w.setTimer, clearTimer: w.clearTimer, onChange: (st) => (last = st.phase) }).start();
    await w.advance(9000);
    expect(last).toBe("waking");
    const notOk = () => Promise.resolve({ ok: true, json: async () => ({ ok: false }) } as Response);
    const w2 = world(); let last2 = "";
    createStatus({ fetchFn: notOk, now: w2.now, setTimer: w2.setTimer, clearTimer: w2.clearTimer, onChange: (st) => (last2 = st.phase) }).start();
    await w2.advance(9000);
    expect(last2).toBe("waking");
  });
  it("start() again after giving up tries again from zero", async () => {
    const w = world(); let last = ""; let up = false;
    const s = createStatus({ fetchFn: () => (up ? ok() : down()), now: w.now, setTimer: w.setTimer, clearTimer: w.clearTimer, onChange: (st) => (last = st.phase) });
    s.start(); await w.advance(GIVE_UP_MS + 1000);
    expect(last).toBe("asleep");
    up = true; s.start(); await w.advance(1000);
    expect(last).toBe("ready");
  });
  it("it only ever reads the health URL of the demo service", () => {
    expect(HEALTH_URL).toBe("https://mandate-gb6t.onrender.com/api/health");
  });
});

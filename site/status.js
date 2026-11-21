// Is the live demo awake? The demo runs on a free host that sleeps when idle; while it wakes (about 30 s) the host answers with its own
// loading page, which has no CORS header, so fetch() fails: that counts as "still waking". No framework, no dependency.
export const HEALTH_URL = "https://mandate-gb6t.onrender.com/api/health";
export const POLL_EVERY_S = 3;
export const GIVE_UP_MS = 90_000;
const REQUEST_TIMEOUT_MS = 8_000;

export function createStatus({
  url = HEALTH_URL, fetchFn = (...a) => fetch(...a), now = () => Date.now(), setTimer = (f, ms) => setTimeout(f, ms), clearTimer = (t) => clearTimeout(t), onChange,
}) {
  let timer, startedAt = 0, inFlight = false, run = 0;
  const emit = (phase, elapsedSec) => onChange({ phase, elapsedSec });

  async function check(myRun) {
    inFlight = true;
    try {
      const ctl = typeof AbortController === "undefined" ? undefined : new AbortController();
      const t = ctl ? setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS) : undefined;
      const res = await fetchFn(url, { mode: "cors", cache: "no-store", credentials: "omit", ...(ctl ? { signal: ctl.signal } : {}) });
      if (t) clearTimeout(t);
      const body = res.ok ? await res.json() : undefined;
      return myRun === run && Boolean(body && body.ok === true);
    } catch {
      return false;
    } finally {
      inFlight = false;
    }
  }

  function tick(myRun, n) {
    if (myRun !== run) return;
    const elapsedMs = now() - startedAt;
    const elapsedSec = Math.floor(elapsedMs / 1000);
    if (elapsedMs >= GIVE_UP_MS) { emit("asleep", elapsedSec); return; }
    emit("waking", elapsedSec);
    const due = n % POLL_EVERY_S === 0 && !inFlight;
    const next = () => { timer = setTimer(() => tick(myRun, n + 1), 1000); };
    if (!due) { next(); return; }
    check(myRun).then((ready) => {
      if (myRun !== run) return;
      if (ready) { emit("ready", Math.floor((now() - startedAt) / 1000)); return; }
      next();
    });
  }

  return {
    /** Starts (or restarts, after giving up) from zero. The first check is immediate: an awake demo is ready at once. */
    start() { run++; clearTimer(timer); startedAt = now(); tick(run, 0); },
    stop() { run++; clearTimer(timer); },
  };
}

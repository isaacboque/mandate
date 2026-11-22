/**
 * Every POST that creates or changes something carries an `Idempotency-Key`: one UUID per user action, the same on every retry of it. The server answers
 * a retry with what the first attempt produced (src/server/idempotency.ts), so retrying after a dropped connection or while the free host wakes up
 * can never act twice. Only network errors and 502/503/504 are retried; a real answer, an error included, is returned as it is. The button is
 * disabled while the request runs (useRun), so one click is one action.
 */
export function newKey(c: Pick<Crypto, "getRandomValues"> & { randomUUID?: () => string } = globalThis.crypto): string {
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16); // not a secure context: build a v4 UUID by hand
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const RETRY_STATUS = new Set([502, 503, 504]);

export async function sendWithRetry(o: { fetchFn?: typeof fetch; url: string; init: RequestInit; key: string; retries?: number; sleep?: (ms: number) => Promise<void> }): Promise<Response> {
  const fetchFn = o.fetchFn ?? ((u, i) => fetch(u, i)), retries = o.retries ?? 2, sleep = o.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const init: RequestInit = { ...o.init, headers: { ...(o.init.headers as Record<string, string> | undefined), "idempotency-key": o.key } };
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetchFn(o.url, init);
      if (!RETRY_STATUS.has(r.status) || attempt >= retries) return r;
    } catch (e) {
      if (attempt >= retries) throw e;
    }
    await sleep(400 * 3 ** attempt);
  }
}

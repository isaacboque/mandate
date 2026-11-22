import { createHash } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";

/**
 * `Idempotency-Key` for the app's own API, as Stripe does it. A client that did not get an answer (a dropped connection, a host that was waking up)
 * retries with the same key, and the server answers with what the first attempt produced instead of doing the action again.
 *
 * - Scope: the visitor (their session) and the route, so one visitor's key never meets another's.
 * - The same key with a different request body is refused (422): it is a client bug, not a retry.
 * - Two requests with the same key at the same moment run once; the second waits for the first.
 * - Answers up to 4xx are kept for `ttlMs`; a 5xx or a 429 is not, so a retry gets a real second attempt.
 * - Streaming answers are not kept (nothing to replay), so the streaming route is left out.
 * Payment logic is not touched: approve and pay are already idempotent per approval; this only makes a retried request answer the same.
 */
type Entry = { bodyHash: string; at: number; pending?: Promise<Stored | undefined>; done?: Stored };
type Stored = { status: number; contentType: string; body: string };

const KEY = /^[A-Za-z0-9_.:-]{8,100}$/;

export function idempotency(o: { scope: (c: Context) => string; ttlMs?: number; max?: number; skip?: (path: string) => boolean; now?: () => number }): MiddlewareHandler {
  const ttl = o.ttlMs ?? 10 * 60_000, max = o.max ?? 500, now = o.now ?? Date.now;
  const entries = new Map<string, Entry>();
  const sweep = () => {
    const t = now();
    for (const [k, e] of entries) if (t - e.at > ttl) entries.delete(k);
    while (entries.size > max) { const first = entries.keys().next().value; if (first === undefined) break; entries.delete(first); }
  };
  const replay = (s: Stored) => new Response(s.body, { status: s.status, headers: { "content-type": s.contentType, "idempotent-replay": "true" } });

  return async (c, next) => {
    const key = c.req.header("idempotency-key");
    if (c.req.method !== "POST" || key === undefined || o.skip?.(c.req.path)) return next();
    if (!KEY.test(key)) return c.json({ error: "Idempotency-Key must be 8 to 100 characters: letters, digits and _ . : -" }, 400);
    sweep();
    const text = await c.req.text(); // Hono keeps the body, so the route can still read it
    const bodyHash = createHash("sha256").update(text).digest("hex");
    const id = `${o.scope(c)}|${c.req.path}|${key}`;
    const seen = entries.get(id);
    if (seen) {
      if (seen.bodyHash !== bodyHash) return c.json({ error: "That Idempotency-Key was used for a different request." }, 422);
      const stored = seen.done ?? (await seen.pending);
      if (stored) return replay(stored);
      // The first attempt left nothing to replay (a 5xx or a 429): this one is a real second attempt.
    }
    let settle!: (s: Stored | undefined) => void;
    const entry: Entry = { bodyHash, at: now(), pending: new Promise((r) => (settle = r)) };
    entries.set(id, entry);
    try {
      await next();
      const res = c.res;
      const contentType = res.headers.get("content-type") ?? "application/json";
      if (res.status >= 500 || res.status === 429 || contentType.includes("text/event-stream")) { entries.delete(id); settle(undefined); return; }
      const stored: Stored = { status: res.status, contentType, body: await res.clone().text() };
      entry.done = stored;
      entry.pending = undefined;
      settle(stored);
    } catch (e) {
      entries.delete(id);
      settle(undefined);
      throw e;
    }
  };
}

import { describe, expect, it } from "vitest";
import { newKey, sendWithRetry } from "../web/src/idempotent";

const KEY_RE = /^[A-Za-z0-9_.:-]{8,100}$/;
const res = (status: number) => new Response("{}", { status, headers: { "content-type": "application/json" } });

describe("idempotency keys on the client (19)", () => {
  it("makes a fresh key per action, in the format the server accepts, with or without crypto.randomUUID", () => {
    const a = newKey(), b = newKey();
    expect(a).not.toBe(b);
    expect(KEY_RE.test(a)).toBe(true);
    const bare = newKey({ getRandomValues: (x: Uint8Array) => x.map((_, i) => i * 7 + 3) } as unknown as Crypto);
    expect(KEY_RE.test(bare)).toBe(true);
  });
  it("sends the same key on every retry of one action", async () => {
    const keys: string[] = [];
    let n = 0;
    const fetchFn = (async (_u: string, init: RequestInit) => { keys.push((init.headers as Record<string, string>)["idempotency-key"]); if (++n < 3) throw new TypeError("Failed to fetch"); return res(200); }) as unknown as typeof fetch;
    const r = await sendWithRetry({ fetchFn, url: "/api/chat", init: { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }, key: "key-123456", sleep: async () => undefined });
    expect(r.status).toBe(200);
    expect(keys).toEqual(["key-123456", "key-123456", "key-123456"]);
  });
  it("retries a host that is waking up (502, 503, 504) but never a real answer (200, 400, 403, 422, 500)", async () => {
    for (const [status, attempts] of [[503, 3], [502, 3], [504, 3], [200, 1], [400, 1], [403, 1], [422, 1], [500, 1]] as const) {
      let n = 0;
      const fetchFn = (async () => { n++; return res(status); }) as unknown as typeof fetch;
      const r = await sendWithRetry({ fetchFn, url: "/x", init: { method: "POST" }, key: "key-123456", sleep: async () => undefined });
      expect(r.status).toBe(status);
      expect(n, String(status)).toBe(attempts);
    }
  });
  it("gives up after the retries and rethrows the network error", async () => {
    let n = 0;
    const fetchFn = (async () => { n++; throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    await expect(sendWithRetry({ fetchFn, url: "/x", init: { method: "POST" }, key: "key-123456", sleep: async () => undefined })).rejects.toThrow("Failed to fetch");
    expect(n).toBe(3);
  });
  it("waits a little longer before each retry", async () => {
    const waits: number[] = [];
    const fetchFn = (async () => { throw new TypeError("x"); }) as unknown as typeof fetch;
    await sendWithRetry({ fetchFn, url: "/x", init: { method: "POST" }, key: "key-123456", sleep: async (ms) => { waits.push(ms); } }).catch(() => undefined);
    expect(waits).toEqual([400, 1200]);
  });
});

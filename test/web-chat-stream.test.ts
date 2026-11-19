import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../web/src/api.js";

const enc = new TextEncoder();
const sse = (chunks: string[], status = 200, type = "text/event-stream") =>
  new Response(new ReadableStream({ start(c) { for (const x of chunks) c.enqueue(enc.encode(x)); c.close(); } }), { status, headers: { "content-type": type } });
const ev = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const DONE = { messages: [{ role: "assistant", text: "final" }], cards: [] };

afterEach(() => vi.unstubAllGlobals());

describe("api.chatStream (web client)", () => {
  it("hands each piece to onText and returns the done payload, even when an event is split across chunks", async () => {
    const whole = ev("text", { delta: "Hel" }) + ev("text", { delta: "lo" }) + ev("done", DONE);
    vi.stubGlobal("fetch", vi.fn(async () => sse([whole.slice(0, 20), whole.slice(20, 55), whole.slice(55)])));
    const got: string[] = [];
    expect(await api.chatStream("hi", (d) => got.push(d))).toEqual(DONE);
    expect(got.join("")).toBe("Hello");
  });
  it("an error event rejects with the server's message and never falls back (the turn already ran)", async () => {
    const f = vi.fn(async () => sse([ev("error", { error: "boom" })]));
    vi.stubGlobal("fetch", f);
    await expect(api.chatStream("hi", () => {})).rejects.toThrow("boom");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("a refusal before the stream (rate limit) shows its message and does not fall back", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: "Demo limit reached" }), { status: 429, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", f);
    await expect(api.chatStream("hi", () => {})).rejects.toThrow("Demo limit reached");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("falls back to /api/chat when nothing reached the server or the answer is not an event stream", async () => {
    const plain = () => new Response(JSON.stringify(DONE), { status: 200, headers: { "content-type": "application/json" } });
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { seen.push(url); if (url.endsWith("/stream")) throw new TypeError("network"); return plain(); }));
    expect(await api.chatStream("hi", () => {})).toEqual(DONE);
    expect(seen).toEqual(["/api/chat/stream", "/api/chat"]);
    seen.length = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { seen.push(url); return url.endsWith("/stream") ? new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }) : plain(); }));
    expect(await api.chatStream("hi", () => {})).toEqual(DONE);
    expect(seen).toEqual(["/api/chat/stream", "/api/chat"]);
  });
  it("a stream that ends without done is an error, not a silent empty reply", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sse([ev("text", { delta: "Hel" })])));
    await expect(api.chatStream("hi", () => {})).rejects.toThrow(/cut off/);
  });
});

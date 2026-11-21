import { describe, expect, it } from "vitest";
import { configFromEnv, createApp } from "../src/server/app.js";
import { makeHarness } from "../src/eval/harness.js";

const SITE = "https://isaacboque.github.io";
const app = (config = configFromEnv({})) => createApp(makeHarness().service, config);
const get = (a: ReturnType<typeof app>, path: string, origin?: string) => a.request(path, { headers: origin ? { origin } : {} });

describe("CORS for the landing page: /api/health only, one origin", () => {
  it("the Pages origin may read /api/health, and the answer says it varies by origin and is not cached", async () => {
    const r = await get(app(), "/api/health", SITE);
    expect(r.status).toBe(200);
    expect(r.headers.get("access-control-allow-origin")).toBe(SITE);
    expect(r.headers.get("vary")).toMatch(/origin/i);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("access-control-allow-credentials")).toBeNull();
    expect((await r.json()) as { ok: boolean }).toMatchObject({ ok: true });
  });
  it("another origin, no origin, or a look-alike gets no CORS header (the browser then refuses to read it)", async () => {
    for (const o of ["https://evil.example", "http://isaacboque.github.io", "https://isaacboque.github.io.evil.example", "null"]) {
      expect((await get(app(), "/api/health", o)).headers.get("access-control-allow-origin"), o).toBeNull();
    }
    expect((await get(app(), "/api/health")).headers.get("access-control-allow-origin")).toBeNull();
  });
  it("no other route gets it, whatever the origin", async () => {
    for (const path of ["/api/config", "/api/mandates", "/api/trace"]) {
      expect((await get(app(), path, SITE)).headers.get("access-control-allow-origin"), path).toBeNull();
    }
    const post = await app().request("/api/chat", { method: "POST", headers: { origin: SITE, "content-type": "application/json" }, body: JSON.stringify({ text: "hi" }) });
    expect(post.headers.get("access-control-allow-origin")).toBeNull();
  });
  it("a preflight for anything else is not answered with permission", async () => {
    const r = await app().request("/api/chat", { method: "OPTIONS", headers: { origin: SITE, "access-control-request-method": "POST" } });
    expect(r.headers.get("access-control-allow-origin")).toBeNull();
  });
  it("PUBLIC_SITE_ORIGIN changes the one allowed origin; a wildcard or a junk value is ignored", async () => {
    const mine = app(configFromEnv({ PUBLIC_SITE_ORIGIN: "https://demo.example.org" }));
    expect((await get(mine, "/api/health", "https://demo.example.org")).headers.get("access-control-allow-origin")).toBe("https://demo.example.org");
    expect((await get(mine, "/api/health", SITE)).headers.get("access-control-allow-origin")).toBeNull();
    for (const bad of ["*", "not a url", "javascript:alert(1)", "https://demo.example.org/path"]) {
      const a = app(configFromEnv({ PUBLIC_SITE_ORIGIN: bad }));
      expect((await get(a, "/api/health", "https://anything.example")).headers.get("access-control-allow-origin"), bad).toBeNull();
      expect((await get(a, "/api/health", SITE)).headers.get("access-control-allow-origin"), bad).toBe(SITE);
    }
  });
  it("the page's own security headers are unchanged", async () => {
    const r = await get(app(), "/api/health", SITE);
    expect(r.headers.get("x-frame-options")).toBe("DENY");
    expect(r.headers.get("content-security-policy")).toMatch(/connect-src 'self'/);
  });
});

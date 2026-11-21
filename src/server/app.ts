import type { Context } from "hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { clientIpFrom } from "./clientIp.js";
import type { MandateService } from "../service/service.js";
import type { RateLimiter } from "./limits.js";
import { SessionStore } from "./sessions.js";
import { MandateInput } from "../mandate/input.js";
import { describeLlm } from "../llm/model.js";

export { MandateInput, MAX_MANDATE_CENTS } from "../mandate/input.js";

/** `trustedProxies`: how many proxies of our own sit in front of the app (0 = none: X-Forwarded-For is ignored). */
export type Config = {
  demoMode: "mock" | "live"; currency: string; trustedProxies?: number;
  /** The model that answers when one is configured (no key, ever). Absent when there is none. */
  llm?: { provider: string; model: string };
};

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  const proxies = Number(env.TRUSTED_PROXIES);
  return { demoMode: env.DEMO_MODE === "live" ? "live" : "mock", currency: env.CURRENCY || "EUR", trustedProxies: Number.isInteger(proxies) && proxies > 0 ? proxies : 0, ...(describeLlm(env) ? { llm: describeLlm(env) } : {}) };
}

/** The biggest JSON body any route needs is a few hundred characters of text; 32 KB is generous. */
const MAX_BODY_BYTES = 32 * 1024;

/**
 * What the page really loads: its own bundle and API, inline `style` attributes from React, product photos from any https
 * host (and the data: favicon). Nothing else may run or load, so an injected script or a remote stylesheet is refused.
 * The PayPal approval page is reached by a normal navigation, which this policy does not restrict.
 */
export const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; font-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";


/**
 * `source` is one MandateService (tests, single-user use) or a SessionStore (the server: one service per visitor).
 * `limiter` optionally caps searches per visitor and per day to protect free-tier quotas.
 */
export function createApp(source: MandateService | SessionStore, config: Config, limiter?: RateLimiter, categoryLimiter?: RateLimiter): Hono {
  const app = new Hono();
  // The per-visitor key: never the first X-Forwarded-For entry (the client writes that one), see clientIp.ts.
  const clientIp = (c: Context) => clientIpFrom({
    forwardedFor: c.req.header("x-forwarded-for"),
    socketIp: (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming?.socket?.remoteAddress,
    trustedProxies: config.trustedProxies,
  });
  const svc = (c: Context): MandateService => (source instanceof SessionStore ? source.forRequest(c) : source);

  // Browser hardening for every answer, API and web page alike (the static files are mounted after this app is built).
  app.use("*", async (c, next) => {
    await next();
    c.header("x-content-type-options", "nosniff");
    c.header("x-frame-options", "DENY");
    c.header("referrer-policy", "no-referrer");
    c.header("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
    c.header("content-security-policy", CSP);
  });
  app.use("/api/*", bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json({ error: "Request too large" }, 413) }));

  app.onError((err, c) => c.json({ error: err instanceof z.ZodError ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : err.message }, 400));

  // What answers, without a session and without any key: the badge and the host's health check read this.
  app.get("/api/health", (c) => c.json({ ok: true, agent: config.llm ? "llm" : "rules", model: config.llm?.model ?? null, provider: config.llm?.provider ?? null }));
  app.get("/api/config", (c) => {
    const service = svc(c);
    return c.json({ ...config, gateway: service.isMock ? "mock" : "paypal-sandbox", agent: service.agentMode, offline: service.offline, resettable: service.isMock, mandate: service.mandate, spentCents: service.spentCents(), seen: service.facets(), now: new Date().toISOString() });
  });

  // The person's switch between the model and the offline rules agent, for THIS session only. A failure never flips it.
  app.post("/api/agent/offline", async (c) => {
    const { offline } = z.object({ offline: z.boolean() }).parse(await c.req.json());
    const service = svc(c);
    service.setOffline(offline);
    return c.json({ agent: service.agentMode, offline: service.offline });
  });

  // 1. mandate
  app.get("/api/mandate", (c) => c.json(svc(c).mandate));
  // Plain words in, a draft out. It signs nothing; the person reviews the form and signs it.
  app.post("/api/mandate/draft", async (c) => {
    const { text } = z.object({ text: z.string().min(3).max(800) }).parse(await c.req.json());
    const service = svc(c);
    const hit = limiter?.hit(clientIp(c)) ?? { ok: true as const };
    if (!hit.ok) return c.json({ error: hit.message }, 429);
    return c.json(await service.draftMandate(text, config.currency));
  });
  app.post("/api/mandate", async (c) => c.json(svc(c).setMandate(MandateInput.parse(await c.req.json())), 201));

  // contracts: several can be active; a person signs drafts and amendments and revokes. The agent has no route here.
  app.get("/api/mandates", (c) => c.json(svc(c).mandates()));
  app.get("/api/drafts", (c) => c.json(svc(c).drafts()));
  app.get("/api/amendments", (c) => c.json(svc(c).amendments()));
  const optionalJson = async (c: Context) => (await c.req.text()).trim() ? c.req.json() : undefined;
  app.post("/api/drafts/:id/sign", async (c) => c.json(svc(c).signDraft(c.req.param("id"), await optionalJson(c)), 201));
  app.post("/api/drafts/:id/discard", (c) => c.json(svc(c).discardDraft(c.req.param("id"))));
  app.post("/api/amendments/:id/sign", async (c) => c.json(svc(c).signAmendment(c.req.param("id"), await optionalJson(c)), 201));
  app.post("/api/amendments/:id/reject", (c) => c.json(svc(c).rejectAmendment(c.req.param("id"))));
  // The one-click fix on a blocked card: a successor contract signed in one step (chain and spend kept). Human-only; no agent tool.
  const FixInput = z.object({ patch: z.object({
    allowedCategories: z.array(z.string()).optional(), allowedMerchants: z.array(z.string()).optional(),
    perItemCapCents: z.number().optional(), totalBudgetCents: z.number().optional(),
  }).strict() }).strict();
  app.post("/api/mandates/:hash/fix", async (c) => c.json(svc(c).applyFix(c.req.param("hash"), FixInput.parse(await c.req.json()).patch), 201));
  app.post("/api/mandates/:hash/revoke", (c) => c.json(svc(c).revoke(c.req.param("hash"))));

  // chat: plain text in, the agent's words plus typed cards out (built from server state, never from model text)
  app.post("/api/chat", async (c) => {
    const { text } = z.object({ text: z.string().min(1).max(500) }).parse(await c.req.json());
    const service = svc(c);
    const hit = limiter?.hit(clientIp(c)) ?? { ok: true as const };
    if (!hit.ok) return c.json({ error: hit.message }, 429);
    return c.json(await service.chat(text));
  });
  // The same turn as /api/chat, as Server-Sent Events: `text` pieces while the model writes, then exactly one `done` (the same
  // payload as /api/chat; the cards come only from it) or one `error`. Streamed text is model text and is only ever shown as text.
  app.post("/api/chat/stream", async (c) => {
    const { text } = z.object({ text: z.string().min(1).max(500) }).parse(await c.req.json());
    const service = svc(c);
    const hit = limiter?.hit(clientIp(c)) ?? { ok: true as const };
    if (!hit.ok) return c.json({ error: hit.message }, 429);
    return streamSSE(c, async (stream) => {
      let queue: Promise<unknown> = Promise.resolve(); // keeps the pieces in order, and the done after the last piece
      try {
        const result = await service.chat(
          text,
          (delta) => { queue = queue.then(() => stream.writeSSE({ event: "text", data: JSON.stringify({ delta }) })); },
          // "waiting for the model" / "busy, retrying in N s": status lines from the server, shown as status, never as the agent's words
          (status) => { queue = queue.then(() => stream.writeSSE({ event: "status", data: JSON.stringify({ text: status }) })); },
        );
        await queue;
        await stream.writeSSE({ event: "done", data: JSON.stringify(result) });
      } catch (e) {
        await stream.writeSSE({ event: "error", data: JSON.stringify({ error: (e as Error).message }) });
      }
    });
  });
  app.get("/api/chat", (c) => c.json(svc(c).history()));

  // 2. ask → 3. proposals
  app.post("/api/ask", async (c) => {
    const { text } = z.object({ text: z.string().min(2).max(500) }).parse(await c.req.json());
    const service = svc(c);
    const hit = limiter?.hit(clientIp(c)) ?? { ok: true as const };
    if (!hit.ok) return c.json({ error: hit.message }, 429);
    return c.json(await service.ask(text));
  });
  app.get("/api/proposals", (c) => c.json(svc(c).list()));
  app.get("/api/proposals/:id", (c) => c.json(svc(c).get(c.req.param("id"))));

  // category lookup for the mandate form: a name finds the category and where it sits in the tree
  app.get("/api/categories", async (c) => {
    const q = (c.req.query("q") ?? "").slice(0, 60);
    const service = svc(c);
    const hit = categoryLimiter?.hit(clientIp(c)) ?? { ok: true as const };
    if (!hit.ok) return c.json({ categories: [] });
    return c.json({ categories: q.trim().length >= 2 ? await service.searchCategories(q) : [] });
  });

  // 4. approve & pay
  app.post("/api/proposals/:id/approve", async (c) => c.json(await svc(c).approve(c.req.param("id"))));
  app.post("/api/proposals/:id/reject", (c) => c.json(svc(c).reject(c.req.param("id"))));
  app.post("/api/proposals/:id/pay", async (c) => c.json(await svc(c).pay(c.req.param("id"))));

  // attack demo, audit, trace, reset
  app.post("/api/attack", async (c) => c.json(await svc(c).attack(), 201));
  app.get("/api/proposals/:id/audit", (c) => {
    const id = c.req.param("id");
    const audit = svc(c).audit(id); // throws for an unknown id, so an error is never sent as a file download
    c.header("content-disposition", `attachment; filename="mandate-audit-${id.replace(/[^\w-]/g, "")}.json"`);
    return c.json(audit);
  });
  app.get("/api/mandates/:hash/audit", (c) => {
    const hash = c.req.param("hash");
    const audit = svc(c).auditContract(hash);
    c.header("content-disposition", `attachment; filename="mandate-contract-audit-${hash.replace(/[^\w-]/g, "")}.json"`);
    return c.json(audit);
  });
  app.get("/api/trace", (c) => c.json(svc(c).trail()));
  app.post("/api/reset", (c) => {
    svc(c).reset();
    return c.json({ ok: true });
  });

  // Anything else under /api is a JSON 404 (without this, the web page's fallback would answer it with HTML).
  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

  return app;
}

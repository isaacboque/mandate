import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import type { MandateService } from "../service/service.js";
import type { RateLimiter } from "./limits.js";
import { SessionStore } from "./sessions.js";

export type Config = { demoMode: "mock" | "live"; currency: string };

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  return { demoMode: env.DEMO_MODE === "live" ? "live" : "mock", currency: env.CURRENCY || "EUR" };
}

const cents = z.number().int().nonnegative();
export const MandateInput = z.object({
  currency: z.string().length(3).transform((s) => s.toUpperCase()),
  totalBudgetCents: cents.positive(),
  perItemCapCents: cents.positive(),
  allowedCategories: z.array(z.string().min(1)).min(1),
  allowedMerchants: z.array(z.string().min(1)).optional(),
  maxQuantityPerItem: z.number().int().min(1).max(100),
  expiresAt: z.string().refine((s) => Number.isFinite(Date.parse(s)), "expiresAt must be an ISO date"),
  autonomy: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("ask_always") }),
    z.object({ mode: z.literal("auto_under"), thresholdCents: cents.positive() }),
  ]),
});

const clientIp = (c: Context) => c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "local";

/**
 * `source` is one MandateService (tests, single-user use) or a SessionStore (the server: one service per visitor).
 * `limiter` optionally caps searches per visitor and per day to protect free-tier quotas.
 */
export function createApp(source: MandateService | SessionStore, config: Config, limiter?: RateLimiter, categoryLimiter?: RateLimiter): Hono {
  const app = new Hono();
  const svc = (c: Context): MandateService => (source instanceof SessionStore ? source.forRequest(c) : source);

  app.onError((err, c) => c.json({ error: err instanceof z.ZodError ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : err.message }, 400));

  app.get("/api/health", (c) => c.json({ ok: true }));
  app.get("/api/config", (c) => {
    const service = svc(c);
    return c.json({ ...config, gateway: service.isMock ? "mock" : "paypal-sandbox", agent: service.agentMode, resettable: service.isMock, mandate: service.mandate, spentCents: service.spentCents(), seen: service.facets(), now: new Date().toISOString() });
  });

  // 1. mandate
  app.get("/api/mandate", (c) => c.json(svc(c).mandate));
  app.post("/api/mandate", async (c) => c.json(svc(c).setMandate(MandateInput.parse(await c.req.json())), 201));

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
    c.header("content-disposition", `attachment; filename="mandate-audit-${id}.json"`);
    return c.json(svc(c).audit(id));
  });
  app.get("/api/trace", (c) => c.json(svc(c).trail()));
  app.post("/api/reset", (c) => {
    svc(c).reset();
    return c.json({ ok: true });
  });

  return app;
}

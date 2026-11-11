import { Hono } from "hono";
import { z } from "zod";
import type { MandateService } from "../service/service.js";

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

export function createApp(service: MandateService, config: Config): Hono {
  const app = new Hono();

  app.onError((err, c) => c.json({ error: err instanceof z.ZodError ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : err.message }, 400));

  app.get("/api/health", (c) => c.json({ ok: true }));
  app.get("/api/config", (c) =>
    c.json({ ...config, gateway: service.isMock ? "mock" : "paypal-sandbox", agent: service.agentMode, resettable: service.isMock, mandate: service.mandate, spentCents: service.spentCents(), now: new Date().toISOString() }),
  );

  // 1. mandate
  app.get("/api/mandate", (c) => c.json(service.mandate));
  app.post("/api/mandate", async (c) => c.json(service.setMandate(MandateInput.parse(await c.req.json())), 201));

  // 2. ask → 3. proposals
  app.post("/api/ask", async (c) => {
    const { text } = z.object({ text: z.string().min(2).max(500) }).parse(await c.req.json());
    return c.json(await service.ask(text));
  });
  app.get("/api/proposals", (c) => c.json(service.list()));
  app.get("/api/proposals/:id", (c) => c.json(service.get(c.req.param("id"))));

  // 4. approve & pay
  app.post("/api/proposals/:id/approve", async (c) => c.json(await service.approve(c.req.param("id"))));
  app.post("/api/proposals/:id/reject", (c) => c.json(service.reject(c.req.param("id"))));
  app.post("/api/proposals/:id/pay", async (c) => c.json(await service.pay(c.req.param("id"))));

  // attack demo, trace, reset
  app.post("/api/attack", async (c) => c.json(await service.attack(), 201));
  app.get("/api/proposals/:id/audit", (c) => {
    const id = c.req.param("id");
    c.header("content-disposition", `attachment; filename="mandate-audit-${id}.json"`);
    return c.json(service.audit(id));
  });
  app.get("/api/trace", (c) => c.json(service.trail()));
  app.post("/api/reset", (c) => {
    service.reset();
    return c.json({ ok: true });
  });

  return app;
}

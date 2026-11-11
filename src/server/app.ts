import { Hono } from "hono";

export type Config = { demoMode: "mock" | "live"; currency: string };

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  return { demoMode: env.DEMO_MODE === "live" ? "live" : "mock", currency: env.CURRENCY || "EUR" };
}

export function createApp(config: Config): Hono {
  const app = new Hono();
  app.get("/api/health", (c) => c.json({ ok: true }));
  app.get("/api/config", (c) => c.json(config));
  return app;
}

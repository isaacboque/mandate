import "dotenv/config";
import { existsSync } from "node:fs";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./server/app.js";
import { llmStartupLine } from "./llm/model.js";
import { serviceFromEnv } from "./server/deps.js";

const { sessions, config, limiter, categoryLimiter, agentMode } = serviceFromEnv();
const app = createApp(sessions, config, limiter, categoryLimiter);
if (existsSync("web/dist")) {
  app.use("/*", serveStatic({ root: "./web/dist" }));
  app.get("*", serveStatic({ path: "./web/dist/index.html" }));
}
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
if (process.env.CATALOG === "channel3" && config.catalog === "fixtures") console.log("CATALOG=channel3 is set but CHANNEL3_API_KEY is missing: using the fixture catalog.");
console.log(llmStartupLine()); // what will answer and from which variable, or what is wrong: never the key
console.log(`Mandate on http://localhost:${port}  (mode: ${config.demoMode}, catalog: ${config.catalog}, agent: ${agentMode}, rate limit: ${limiter.enabled ? "on" : "off"})`);

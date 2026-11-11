import "dotenv/config";
import { existsSync } from "node:fs";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./server/app.js";
import { serviceFromEnv } from "./server/deps.js";

const { service, config } = serviceFromEnv();
const app = createApp(service, config);
if (existsSync("web/dist")) {
  app.use("/*", serveStatic({ root: "./web/dist" }));
  app.get("*", serveStatic({ path: "./web/dist/index.html" }));
}
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`Mandate on http://localhost:${port}  (mode: ${config.demoMode}, agent: ${service.agentMode})`);

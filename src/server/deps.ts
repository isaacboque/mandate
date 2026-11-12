import { Channel3Catalog } from "../catalog/Channel3Catalog.js";
import { FixtureCatalog } from "../catalog/FixtureCatalog.js";
import { ApprovalQueue } from "../approval/queue.js";
import { hasLlmKey, modelFromEnv } from "../llm/model.js";
import { MockPayments } from "../payments/MockPayments.js";
import { PayPalOrders } from "../payments/PayPalOrders.js";
import { RestOrdersInvoker } from "../payments/RestOrdersInvoker.js";
import { MandateService } from "../service/service.js";
import { JsonlTracer } from "../trace/trace.js";
import { configFromEnv, type Config } from "./app.js";
import { RateLimiter } from "./limits.js";
import { SessionStore } from "./sessions.js";

const num = (v: string | undefined, fallback: number) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : fallback);

/**
 * DEMO_MODE=mock (default): fixtures + mock payments, no keys. DEMO_MODE=live: Channel3 + PayPal sandbox.
 * The LLM is used when a key is set. Each visitor gets their own service (mandate, budget, proposals, trace);
 * the catalog, the model and the PayPal token client are shared.
 * Live mode limits searches per visitor and per day (RATE_LIMIT_ASKS_PER_HOUR, DAILY_ASK_CAP) to protect free quotas.
 */
export function serviceFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const config: Config = configFromEnv(env);
  const live = config.demoMode === "live";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const tracer = new JsonlTracer("traces");
  const catalog = live ? new Channel3Catalog(env.CHANNEL3_API_KEY ?? "", { currency: config.currency }) : new FixtureCatalog();
  const attackCatalog = new FixtureCatalog();
  const invoker = live ? new RestOrdersInvoker(env.PAYPAL_CLIENT_ID ?? "", env.PAYPAL_CLIENT_SECRET ?? "") : undefined;
  const model = hasLlmKey(env) ? modelFromEnv(env) : undefined;
  // Where PayPal sends the buyer back to. Render sets RENDER_EXTERNAL_URL itself.
  const appUrl = (env.APP_URL || env.RENDER_EXTERNAL_URL || `http://localhost:${env.PORT ?? 8787}`).replace(/\/$/, "");

  const makeService = (id: string): MandateService => {
    const runId = `session-${stamp}-${id.slice(0, 8)}`;
    const approvals = new ApprovalQueue(tracer, runId);
    const payments = invoker
      ? new PayPalOrders(invoker, approvals, tracer, { traceId: runId, returnUrl: `${appUrl}/?paypal=return`, cancelUrl: `${appUrl}/?paypal=cancel` })
      : new MockPayments(approvals, tracer, { traceId: runId });
    return new MandateService({ catalog, attackCatalog, payments, approvals, tracer, runId, model, idPrefix: id.slice(0, 6) });
  };

  const sessions = new SessionStore(makeService, { ttlMs: num(env.SESSION_TTL_MINUTES, 120) * 60 * 1000, max: num(env.MAX_SESSIONS, 300) });
  const limiter = new RateLimiter(num(env.RATE_LIMIT_ASKS_PER_HOUR, live ? 12 : 0), num(env.DAILY_ASK_CAP, live ? 300 : 0));
  const categoryLimiter = new RateLimiter(num(env.RATE_LIMIT_CATEGORIES_PER_HOUR, live ? 120 : 0), 0);
  return { sessions, makeService, limiter, categoryLimiter, config, agentMode: model ? ("llm" as const) : ("rules" as const) };
}

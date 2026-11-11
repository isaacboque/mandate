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

/** DEMO_MODE=mock (default): fixtures + mock payments, no keys. DEMO_MODE=live: Channel3 + PayPal sandbox. LLM used when a key is set. */
export function serviceFromEnv(env: NodeJS.ProcessEnv = process.env): { service: MandateService; config: Config } {
  const config = configFromEnv(env);
  const runId = `session-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const tracer = new JsonlTracer("traces");
  const approvals = new ApprovalQueue(tracer, runId);
  const live = config.demoMode === "live";
  const catalog = live ? new Channel3Catalog(env.CHANNEL3_API_KEY ?? "", { currency: config.currency }) : new FixtureCatalog();
  const payments = live
    ? new PayPalOrders(new RestOrdersInvoker(env.PAYPAL_CLIENT_ID ?? "", env.PAYPAL_CLIENT_SECRET ?? ""), approvals, tracer, { file: "data/paypal/orders.json", traceId: runId })
    : new MockPayments(approvals, tracer, { traceId: runId });
  const model = hasLlmKey(env) ? modelFromEnv(env) : undefined;
  const service = new MandateService({ catalog, attackCatalog: new FixtureCatalog(), payments, approvals, tracer, runId, model });
  return { service, config };
}

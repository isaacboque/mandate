// Live sandbox check: creates a 1.00 EUR order, prints the buyer approve link, polls up to 5 minutes
// for the buyer to approve it, captures it and prints the final status.
// Needs PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in your local env file. Sandbox only; prints no secrets.
import "dotenv/config";
import { PayPalOrders } from "../src/payments/PayPalOrders.js";
import { RestOrdersInvoker } from "../src/payments/RestOrdersInvoker.js";
import { JsonlTracer } from "../src/trace/trace.js";

const id = process.env.PAYPAL_CLIENT_ID;
const secret = process.env.PAYPAL_CLIENT_SECRET;
if (!id || !secret) {
  console.error("Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET first.");
  process.exit(1);
}
// Running this script is the approval: you started it on purpose, for exactly one 1.00 EUR order.
const approvals = { assertExecutable() {}, markExecuted() {} };
const gw = new PayPalOrders(new RestOrdersInvoker(id, secret), approvals, new JsonlTracer("traces"), { traceId: "smoke-orders" });

const order = await gw.createOrder({
  mandateHash: "smoke",
  lines: [{ name: "Mandate smoke test", quantity: 1, unitPriceCents: 100 }],
  currency: process.env.CURRENCY || "EUR",
  idempotencyKey: `smoke-${Date.now()}`,
  approvalId: "smoke",
});
console.log(`Order ${order.id} created (${order.status}).`);
console.log(`Open this link and approve with your sandbox personal (buyer) account:\n${order.approveUrl}`);

const deadline = Date.now() + 5 * 60 * 1000;
let cur = order;
while (Date.now() < deadline && cur.status !== "approved" && cur.status !== "completed") {
  await new Promise((r) => setTimeout(r, 5000));
  cur = await gw.getOrder(order.id);
  process.stdout.write(`status: ${cur.status}\r`);
}
console.log();
if (cur.status !== "approved" && cur.status !== "completed") {
  console.error(`Gave up after 5 minutes (status ${cur.status}). Run it again and approve faster.`);
  process.exit(1);
}
const done = await gw.captureOrder(order.id, "smoke");
console.log(`Final status: ${done.status}, capture id: ${done.captureId ?? "n/a"}`);

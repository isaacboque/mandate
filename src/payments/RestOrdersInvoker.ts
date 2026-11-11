import type { ToolInvoker } from "./PayPalOrders.js";

const REFRESH_MS = 45 * 60 * 1000;

type Item = { name: string; quantity: number; itemCost: number; itemTotal: number };

/**
 * Runs the same three tools (create_order, get_order, pay_order) straight against the PayPal
 * Orders v2 REST API. Why not only the Agent Toolkit: its `create_order` schema accepts USD only,
 * and this demo is in EUR. Same OAuth rule as the toolkit invoker: token refreshed every 45 min
 * and once more after a 401.
 */
export class RestOrdersInvoker implements ToolInvoker {
  private token?: string;
  private tokenAt = 0;
  private base: string;

  constructor(
    private clientId: string,
    private clientSecret: string,
    private opts: { sandbox?: boolean; fetch?: typeof fetch; now?: () => number } = {},
  ) {
    if (!clientId || !clientSecret) throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required");
    this.base = opts.sandbox === false ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  }

  private f() {
    return this.opts.fetch ?? fetch;
  }
  private now() {
    return (this.opts.now ?? Date.now)();
  }

  private async refresh(): Promise<string> {
    const res = await this.f()(`${this.base}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) throw new Error(`PayPal auth failed with HTTP ${res.status} (check PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET)`);
    this.token = ((await res.json()) as { access_token: string }).access_token;
    this.tokenAt = this.now();
    return this.token;
  }

  private async request(method: string, path: string, body?: unknown, requestId?: string, retry = true): Promise<unknown> {
    const token = !this.token || this.now() - this.tokenAt > REFRESH_MS ? await this.refresh() : this.token;
    const res = await this.f()(`${this.base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(requestId ? { "paypal-request-id": requestId } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401 && retry) {
      this.token = undefined;
      return this.request(method, path, body, requestId, false);
    }
    const json = (await res.json().catch(() => ({}))) as { message?: string; name?: string };
    if (!res.ok) throw new Error(`PayPal ${method} ${path.replace(/\/[A-Z0-9]{10,}/, "/{id}")} failed with HTTP ${res.status}: ${json.message ?? json.name ?? "error"}`);
    return json;
  }

  async call(tool: string, params: Record<string, unknown>): Promise<unknown> {
    switch (tool) {
      case "create_order": {
        const cur = String(params.currencyCode);
        const items = params.items as Item[];
        const total = items.reduce((s, i) => s + Math.round(i.itemTotal * 100), 0);
        const v = (n: number) => (n / 100).toFixed(2);
        return this.request("POST", "/v2/checkout/orders", {
          intent: "CAPTURE",
          purchase_units: [{
            description: String(params.notes ?? "").slice(0, 120) || undefined,
            amount: { currency_code: cur, value: v(total), breakdown: { item_total: { currency_code: cur, value: v(total) } } },
            items: items.map((i) => ({ name: i.name, quantity: String(i.quantity), unit_amount: { currency_code: cur, value: v(Math.round(i.itemCost * 100)) } })),
          }],
          payment_source: {
            paypal: { experience_context: { user_action: "PAY_NOW", return_url: params.returnUrl, cancel_url: params.cancelUrl } },
          },
        }, typeof params.requestId === "string" ? params.requestId : undefined);
      }
      case "get_order":
        return this.request("GET", `/v2/checkout/orders/${encodeURIComponent(String(params.id))}`);
      case "pay_order":
        return this.request("POST", `/v2/checkout/orders/${encodeURIComponent(String(params.id))}/capture`, {});
      default:
        throw new Error(`Unsupported PayPal tool ${tool}`);
    }
  }
}

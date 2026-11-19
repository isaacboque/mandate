import { useEffect, useState } from "react";
import { api, type TraceEvent } from "./api";
import { traceRows } from "./trace";

/* ---------- Trace panel ---------- */
type Json = Record<string, unknown> | undefined;
/** One plain sentence per event, so the trace reads as a story. The raw JSON is one click away. */
function describe(e: TraceEvent): string {
  const a = (e.args ?? {}) as Json as Record<string, unknown>;
  const r = (e.result ?? {}) as Record<string, unknown>;
  switch (e.step) {
    case "mandate.signed": return `Mandate signed (${String(r.hash ?? "")})`;
    case "ask": return `You asked: "${String(a.text ?? "")}"`;
    case "agent.start": return `Agent started (${a.mode === "llm" ? "AI model" : "rules"})`;
    case "agent.search_products": return `Searched the catalog: ${Array.isArray(r.ids) ? r.ids.length : 0} results`;
    case "agent.get_product": return "Looked up one product";
    case "agent.propose_cart": return r.blocked ? "Agent proposed a cart (blocked)" : "Agent proposed a cart";
    case "agent.refused": return `Agent step refused: ${e.error ?? ""}`;
    case "agent.finish": return "Agent finished";
    case "agent.llm_failed": return "AI model failed; the rules agent took over";
    case "guardrails.checkCart": { const n = Array.isArray(r.checks) ? (r.checks as { ok: boolean }[]).filter((c) => !c.ok).length : 0; return r.blocked ? `Guardrails blocked the cart (${n} failed)` : "Guardrails: all checks passed"; }
    case "approval.proposed": return "Waiting for approval";
    case "approval.approved": return "You approved";
    case "approval.auto_approved": return "The mandate approved it (under the auto-buy amount)";
    case "approval.rejected": return "You rejected it";
    case "approval.executed": return "Approval used";
    case "execution.recheck": return r.ok ? "Re-checked live price and mandate: still fine" : `Re-check refused: ${String(((r.problems as string[]) ?? [])[0] ?? "")}`;
    case "order.created": return "Order created";
    case "payment.captured": return "Payment captured";
    case "chat.turn": return `You said something in the chat (${a.mode === "llm" ? "AI model" : "rules"} mode)`;
    case "draft.created": return "Agent drafted a contract (not signed)";
    case "amendment.proposed": return "Agent proposed a change to a contract (not signed)";
    case "mandate.revoked": return "You revoked a contract";
    case "mandate.drafted": return "A contract was drafted from your words (not signed)";
    case "concierge.llm_failed": return "AI model failed; the rules reader took over";
    case "demo.reset": return "Demo reset";
    default: return e.step.startsWith("paypal.") || e.step.startsWith("payments.") ? `Payments: ${e.step.split(".").slice(1).join(" ")}` : e.step;
  }
}

export function TracePanel({ active }: { active: boolean }) {
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState<number>();
  useEffect(() => {
    if (!active) return;
    let alive = true;
    // A tab nobody is looking at does not poll; it catches up the moment it is shown again.
    const tick = () => { if (!document.hidden) api.trace().then((e) => alive && setEvents(e)).catch(() => {}); };
    tick();
    const t = setInterval(tick, 1500);
    document.addEventListener("visibilitychange", tick);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [active]);
  const shown = traceRows(events, filter);
  return (
    <aside className="trace" aria-label="Trace">
      <h2>Trace</h2>
      <p className="muted small">Everything the agent, the guardrails and PayPal did, in order. Click an event for the raw JSON.</p>
      <div className="chips">
        {["all", "llm", "tool", "decision", "approval", "error"].map((k) => (
          <button key={k} className={`chip ${filter === k ? "sel" : ""}`} onClick={() => setFilter(k)}>{k}</button>
        ))}
      </div>
      <ol>
        {shown.map(({ n, e }) => (
          <li key={n} className={`ev ${e.kind}`}>
            <button className="evbtn" onClick={() => setOpen(open === n ? undefined : n)} aria-expanded={open === n}>
              <div className="evh"><span className="kindtag">{e.kind}</span> <b>{describe(e)}</b> <time>{new Date(e.ts).toLocaleTimeString()}</time></div>
              {e.error && <div className="everr">{e.error}</div>}
            </button>
            {open === n && <pre><span className="stepname">{e.step}</span>{"\n"}{JSON.stringify({ args: e.args, result: e.result }, null, 2)}</pre>}
          </li>
        ))}
        {!active && <li className="muted">Nothing yet: talk to the agent.</li>}
        {active && shown.length === 0 && <li className="muted">Nothing yet.</li>}
      </ol>
    </aside>
  );
}


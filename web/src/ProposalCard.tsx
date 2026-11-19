import { useState } from "react";
import { api, money, type Check, type Config, type Proposal } from "./api";
import { explainAttack } from "./attack";
import { Icon } from "./icons";
import { CHECK_LABEL } from "./labels";
import { Thumb, safeHref } from "./shared";
import type { RunFn } from "./useRun";

const STATUS_LABEL: Record<Proposal["status"], string> = {
  blocked: "Blocked", pending: "Needs your approval", auto_approved: "Approved by the contract", awaiting_buyer: "Waiting for the buyer", paid: "Paid", rejected: "Rejected", failed: "Stopped at checkout",
};

function CheckRow({ c, i }: { c: Check; i: number }) {
  return (
    <li className={c.ok ? "pass" : "fail"} style={{ ["--i" as string]: i }}>
      <Icon name={c.ok ? "check" : "cross"} size={16} />
      <span className="cname">{CHECK_LABEL[c.name]}</span>
      {!c.ok && <span className="creason">{c.reason}</span>}
      <span className="sr-only">{c.ok ? "passed" : "failed"}</span>
    </li>
  );
}

function AttackStory({ p }: { p: Proposal }) {
  const story = explainAttack(p);
  if (!story) return null;
  return (
    <section className="attackstory" aria-label="What happened in this attack">
      <ol>
        <li><span>The listing told the model</span><b>{story.told}</b></li>
        <li><span>The fooled model proposed</span><b>{story.proposed}</b></li>
        <li><span>Stopped by</span><b>{story.stoppedBy.length ? story.stoppedBy.join(" · ") : "nothing"}</b></li>
      </ol>
      <p className={p.blocked ? "safe" : "unsafe"}>{story.outcome}</p>
    </section>
  );
}

function ProposalBody({ p, fresh }: { p: Proposal; fresh?: boolean }) {
  const failed = p.checks.filter((c) => !c.ok);
  const passed = p.checks.filter((c) => c.ok);
  return (
    <article className={`pcard card ${p.blocked ? "blocked" : ""}`}>
      <div className={`verdict ${p.blocked ? "bad" : "good"} ${fresh && p.blocked ? "shake" : ""}`}>
        <Icon name={p.blocked ? "cross" : "shield"} size={18} />
        <b>{p.blocked ? `Blocked: ${failed.length} of ${p.checks.length} checks failed` : `Inside the contract: ${passed.length} of ${p.checks.length} checks passed`}</b>
      </div>
      <AttackStory p={p} />
      <div className="phead">
        <span className={`pstatus ${p.status}`}>{STATUS_LABEL[p.status]}</span>
        {p.source === "attack" && <span className="badge live">Attack demo</span>}
        {p.agent && p.source === "agent" && <span className="badge">Picked by the {p.agent === "llm" ? "AI model" : "rules agent"}</span>}
      </div>

      <ul className="lines">
        {p.lines.map((l) => (
          <li key={l.productId}>
            <Thumb src={l.imageUrl} title={l.title} />
            <div className="ltext">
              <b>{safeHref(l.url) ? <a href={safeHref(l.url)} target="_blank" rel="noreferrer noopener">{l.title}</a> : l.title}</b>
              <span className="muted small">{l.merchant}{l.quantity !== 1 && <span className="qty"> ×{l.quantity}</span>}</span>
              <span className="muted small why">{l.reason}</span>
            </div>
            <div className="amt">{money(l.priceCents * l.quantity, l.currency)}</div>
          </li>
        ))}
      </ul>
      {p.summary && p.source !== "attack" && <p className="muted small summary">{p.summary}</p>}

      {failed.length > 0 && <ul className="checks failures" aria-label="Failed guardrail checks">{failed.map((c, i) => <CheckRow key={c.name} c={c} i={i} />)}</ul>}
      {passed.length > 0 && (
        <details className="passed" open={p.status === "pending" || p.blocked}>
          <summary>{passed.length === p.checks.length ? "All 11 guardrail checks passed" : `${passed.length} checks passed`}</summary>
          <ul className="checks" aria-label="Passed guardrail checks">{passed.map((c, i) => <CheckRow key={c.name} c={c} i={i} />)}</ul>
        </details>
      )}
      {p.blocked && <p className="blockedmsg">Nothing can be approved or paid. The model can be fooled; this check cannot.</p>}
    </article>
  );
}


const STAGES = ["Guardrails passed", "Approval", "Order created", "Buyer approves", "Payment captured"];

/** Where the purchase is, as a sequence the person can read at a glance. */
function stageOf(p: Proposal): { done: number; fail?: number; labels: string[] } {
  const labels = STAGES.slice();
  if (p.autoApproved) labels[1] = "Approved by the mandate";
  switch (p.status) {
    case "pending": return { done: 1, labels };
    case "auto_approved":
    case "awaiting_buyer": return { done: 3, labels };
    case "paid": return { done: 5, labels };
    case "rejected": return { done: 1, fail: 1, labels };
    case "failed": return p.order ? { done: 3, fail: 4, labels } : { done: 1, fail: 2, labels };
    default: return { done: 0, fail: 0, labels };
  }
}

function Timeline({ p }: { p: Proposal }) {
  const { done, fail, labels } = stageOf(p);
  return (
    <ol className="tl" aria-label="Purchase progress">
      {labels.map((l, i) => {
        const state = fail === i ? "fail" : i < done ? "done" : i === done && fail === undefined ? "now" : "todo";
        return <li key={l} className={state}><span className="dot">{state === "done" ? <Icon name="check" size={13} /> : state === "fail" ? <Icon name="cross" size={13} /> : i + 1}</span><span>{l}</span></li>;
      })}
    </ol>
  );
}

/**
 * A proposal in the chat: what the agent wants to buy, what the guardrails said, and the buttons only the person can press.
 * Approve, Reject and Pay are the existing human endpoints; nothing in the agent's text can reach them.
 */
export function ProposalCard({ p, config, busy, run, onChange, fresh }: { p: Proposal; config: Config; busy: boolean; run: RunFn; onChange: (p: Proposal) => void; fresh?: boolean }) {
  const mock = config.demoMode === "mock";
  const link = p.order?.approveUrl?.startsWith("http") ? p.order.approveUrl : undefined;
  const [doing, setDoing] = useState<"approve" | "reject" | "pay">();
  const [justPaid, setJustPaid] = useState(false);
  const act = (what: "approve" | "reject" | "pay", fn: () => Promise<Proposal>) => {
    setDoing(what);
    return run(fn).then((r) => { if (r) { if (what === "pay" && r.status === "paid") setJustPaid(true); onChange(r); } }).finally(() => setDoing(undefined));
  };
  return (
    <div className="pwrap">
      {!p.blocked && p.status !== "rejected" && <Timeline p={p} />}
      <ProposalBody p={p} fresh={fresh} />
      {p.status === "pending" && (
        <div className="actions" role="group" aria-label="Your decision">
          <button className="ghost" disabled={busy} aria-busy={doing === "reject"} onClick={() => act("reject", () => api.reject(p.id))}>{doing === "reject" ? "Rejecting…" : "Reject"}</button>
          <button className="primary" disabled={busy} aria-busy={doing === "approve"} onClick={() => act("approve", () => api.approve(p.id))}>{doing === "approve" ? "Approving…" : `Approve ${money(p.totalCents, p.currency)}`}</button>
        </div>
      )}
      {(p.status === "awaiting_buyer" || p.status === "auto_approved") && p.order && (
        <div className="payarea">
          <p className="muted small">{mock ? "Demo: simulate the buyer approving on PayPal, then capture the payment." : "Open PayPal, approve with the sandbox buyer account, come back and capture the payment."}</p>
          {link && <p><a className="paylink" href={link} target="_blank" rel="noreferrer noopener"><Icon name="external" size={15} /> Approve in PayPal sandbox</a></p>}
          <div className="actions"><button className="primary" disabled={busy} aria-busy={doing === "pay"} onClick={() => act("pay", () => api.pay(p.id))}>{doing === "pay" ? "Capturing payment…" : mock ? "Pay (simulate buyer)" : "Capture payment"}</button></div>
        </div>
      )}
      {p.status === "paid" && (
        <div className={`receipt ${justPaid ? "just-paid" : ""}`}>
          <b className="bigamt">Paid {money(p.totalCents, p.currency)}</b> <span className="badge good">{p.autoApproved ? "by the contract" : "approved by you"}</span>
          <dl>
            <dt>Order</dt><dd className="mono">{p.order?.id}</dd>
            <dt>Contract</dt><dd className="mono">{p.mandateHash}</dd>
          </dl>
          <a className="ghost auditlink" href={`/api/proposals/${p.id}/audit`} download>Download audit (JSON)</a>
        </div>
      )}
      {p.status === "failed" && <div className="alert" role="alert">Stopped at checkout: {p.error}. The guardrails ran again with live data and refused. No money moved.</div>}
      {p.status === "rejected" && <p className="muted small">You rejected this. Nothing was paid.</p>}
    </div>
  );
}

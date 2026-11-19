import { useEffect, useRef, useState } from "react";
import { money, type Amendment, type BlockedView, type Card, type Config, type MandateView, type PendingDraft, type Proposal } from "./api";
import { meter } from "./cards";
import { Icon } from "./icons";
import { CHECK_LABEL } from "./labels";
import { ProposalCard } from "./ProposalCard";
import { Working, sendKey, symbol } from "./shared";
import type { RunFn } from "./useRun";

export type ChatItem = { id: number; role: "user" | "agent"; text: string; cards: Card[] };

type Ctx = {
  config: Config; busy: boolean; run: RunFn;
  proposals: Map<string, Proposal>; drafts: PendingDraft[]; amendments: Amendment[];
  freshAttack?: string;
  onReview: () => void; onFix: (b: BlockedView) => void; onProposalChange: (p: Proposal) => void;
};

function PendingCard({ kind, title, status, onReview }: { kind: "draft" | "amendment"; title: string; status: string; onReview: () => void }) {
  return (
    <div className={`minicard ${kind}`} role="group" aria-label={`${kind} card`}>
      <span className={`statuschip ${status === "pending" ? "draft" : status}`}>{status === "pending" ? "Not signed" : status}</span>
      <b>{title}</b>
      {status === "pending" ? <button className="ghost small" onClick={onReview}>Review in Contracts</button> : <span className="muted small">Handled in Contracts.</span>}
    </div>
  );
}

function CardView({ card, ctx }: { card: Card; ctx: Ctx }) {
  switch (card.type) {
    case "draft": {
      const d = ctx.drafts.find((x) => x.id === card.draft.id) ?? card.draft;
      const m = d.mandate;
      return <PendingCard kind="draft" status={d.status} onReview={ctx.onReview} title={`Draft contract: ${money(m.totalBudgetCents, m.currency)} for ${m.allowedCategories.join(", ")}`} />;
    }
    case "amendment": {
      const a = ctx.amendments.find((x) => x.id === card.amendment.id) ?? card.amendment;
      return <PendingCard kind="amendment" status={a.status} onReview={ctx.onReview} title={`Proposed change: ${a.diff.length} field${a.diff.length === 1 ? "" : "s"}${a.reason ? `. ${a.reason}` : ""}`} />;
    }
    case "proposal": {
      const p = ctx.proposals.get(card.proposal.id) ?? card.proposal;
      return <ProposalCard p={p} config={ctx.config} busy={ctx.busy} run={ctx.run} onChange={ctx.onProposalChange} fresh={p.id === ctx.freshAttack} />;
    }
    case "blocked": {
      const b = card.blocked;
      return (
        <div className="minicard blockedcard" role="group" aria-label="Blocked proposal">
          <span className="verdict bad"><Icon name="cross" size={16} /> <b>Blocked: {b.title}</b></span>
          <ul className="whyblocked">{b.failed.map((f) => <li key={f.name}><Icon name="cross" size={14} /> <span><b>{CHECK_LABEL[f.name] ?? f.name}:</b> {f.reason}</span></li>)}</ul>
          {b.error && <p className="muted small">{b.error}</p>}
          {b.fix ? <button className="ghost small fix" disabled={ctx.busy} onClick={() => ctx.onFix(b)}>{b.fix.label}</button> : <p className="muted small">Nothing you could widen would fix this.</p>}
        </div>
      );
    }
    case "spending":
      return (
        <div className="minicard spendingcard" role="group" aria-label="Spending">
          {card.mandates.length === 0 && <span className="muted small">No contracts yet.</span>}
          {card.mandates.map((v: MandateView) => {
            const bar = meter(v);
            return (
              <div key={v.hash} className="mini-meter">
                <div className="meter" role="img" aria-label={`${money(v.spentCents, v.mandate.currency)} spent, ${money(v.remainingCents, v.mandate.currency)} left`}><i className="spent" style={{ width: `${bar.spent}%` }} /><i className="pend" style={{ width: `${bar.pending}%` }} /><i className="rest" style={{ width: `${bar.remaining}%` }} /></div>
                <span className="small"><span className="mono">{v.hash}</span> · {v.status} · {money(v.spentCents, v.mandate.currency)} of {money(v.mandate.totalBudgetCents, v.mandate.currency)}</span>
              </div>
            );
          })}
        </div>
      );
  }
}

export function Chat({ items, ctx, sending, streaming = "", onSend, onAttack }: { items: ChatItem[]; ctx: Ctx; sending: boolean; streaming?: string; onSend: (text: string) => Promise<boolean>; onAttack: () => void }) {
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const sym = symbol(ctx.config.currency);
  const live = ctx.config.demoMode === "live";
  const chips = live
    ? [`Indoor futsal shoes for men, max ${sym}90`, `Running shoes, max ${sym}70`, `Wireless earbuds under ${sym}60`]
    : [`Indoor futsal shoes, max 90 ${sym}`, `Grip socks, max 15 ${sym}`, `A futsal ball, max 40 ${sym}`];
  const first = !items.some((i) => i.role === "user");
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => { end.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" }); }, [items.length, sending, streaming.length > 0, reduce, ctx.proposals]);
  const send = async (t = text) => {
    const v = t.trim();
    if (!v || sending) return;
    setText("");
    const ok = await onSend(v);
    if (!ok) setText(v); // a failed send keeps what was typed
    input.current?.focus();
  };
  return (
    <section className="chat" aria-label="Chat with the agent">
      <div className="panehead">
        <h2>Agent</h2>
        <span className="badge" title={ctx.config.agent === "llm" ? "An AI model reads your words" : "No AI key: a built-in rules reader handles your words"}>{ctx.config.agent === "llm" ? "AI mode" : "Rules mode"}</span>
      </div>
      <div className="msgs" role="log" aria-live="polite" aria-label="Conversation">
        {items.length === 0 && (
          <div className="emptystate">
            <b>Tell the agent what to buy.</b>
            <p className="muted small">It drafts a contract for you to sign, then searches and proposes carts inside it. It cannot sign, approve or pay.</p>
          </div>
        )}
        {items.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            {m.text && <p className="bubble">{m.text}</p>}
            {m.cards.map((c, i) => <CardView key={i} card={c} ctx={ctx} />)}
          </div>
        ))}
        {sending && streaming && (
          // The model's words as they arrive: plain text only, never actions. The final reply (and its cards) replaces this bubble.
          <div className="msg agent streaming" aria-live="off"><p className="bubble">{streaming}</p></div>
        )}
        {sending && <Working live={live && ctx.config.agent === "llm"} />}
        <div ref={end} />
      </div>
      {first && !sending && (
        <div className="examples chips-row" role="group" aria-label="Suggestions">
          {chips.map((x) => <button key={x} type="button" className="example" onClick={() => send(x)}><b>{x}</b></button>)}
        </div>
      )}
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <label htmlFor="chat-input" className="sr-only">Message the agent</label>
        <textarea
          id="chat-input" ref={input} className="ask" rows={2} maxLength={500} value={text} placeholder="e.g. Indoor futsal shoes, max 90 €" disabled={false}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (sendKey(e)) { e.preventDefault(); send(); } }}
        />
        <div className="composer-actions">
          <button type="button" className="ghost danger small" disabled={ctx.busy} onClick={onAttack} title="Loads a poisoned listing that tells the agent to buy 10 units">Try an attack</button>
          <button type="submit" className="primary" disabled={sending || text.trim().length < 1}>{sending ? "Sending…" : "Send"}</button>
        </div>
      </form>
    </section>
  );
}

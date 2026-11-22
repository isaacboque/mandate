import { useEffect, useState } from "react";
import { AmendmentDiff } from "./AmendmentDiff";
import { api, money, type Amendment, type Config, type MandateView, type PendingDraft } from "./api";
import { countdown, meter, sortContracts } from "./cards";
import { DraftForm } from "./DraftForm";
import { Icon } from "./icons";
import type { RunFn } from "./useRun";

const STATUS_TEXT: Record<MandateView["status"], string> = { active: "Active", revoked: "Revoked", superseded: "Superseded", expired: "Expired" };

function useNow(everyMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), everyMs); return () => clearInterval(t); }, [everyMs]);
  return now;
}

/** The plain-words rule, always on screen. */
export const RULE_LINE = "The agent can propose. Only you can sign, amend, revoke, approve or pay.";

function Tags({ items, empty }: { items?: string[]; empty: string }) {
  return <span className="tags">{items?.length ? items.map((t) => <span key={t} className="tag ro">{t}</span>) : <span className="muted">{empty}</span>}</span>;
}

function ContractCard({ v, busy, run, onChanged, now }: { v: MandateView; busy: boolean; run: RunFn; onChanged: () => void; now: number }) {
  const [confirm, setConfirm] = useState(false);
  const m = v.mandate;
  const bar = meter(v);
  return (
    <article className={`card contract ${v.status}`} aria-label={`Contract ${v.hash}, ${STATUS_TEXT[v.status]}`}>
      <div className="chead">
        <span className={`statuschip ${v.status}`}>{STATUS_TEXT[v.status]}</span>
        <span className="mono hash" title="Hash of the signed terms">{v.hash}</span>
        {v.supersedes && <span className="muted small">replaces {v.supersedes}</span>}
      </div>
      <div className="meterbox">
        <div className="meter" role="img" aria-label={`Spent ${money(v.spentCents, m.currency)}, waiting for approval ${money(v.pendingCents, m.currency)}, remaining ${money(v.remainingCents, m.currency)} of ${money(m.totalBudgetCents, m.currency)}`}>
          <i className="spent" style={{ width: `${bar.spent}%` }} /><i className="pend" style={{ width: `${bar.pending}%` }} /><i className="rest" style={{ width: `${bar.remaining}%` }} />
        </div>
        <p className="meterlegend small">
          <span><b>{money(v.spentCents, m.currency)}</b> spent</span>
          {v.pendingCents > 0 && <span><b>{money(v.pendingCents, m.currency)}</b> awaiting you</span>}
          <span><b>{money(v.remainingCents, m.currency)}</b> left of {money(m.totalBudgetCents, m.currency)}</span>
        </p>
      </div>
      <dl className="cterms">
        <dt>Per item</dt><dd>{money(m.perItemCapCents, m.currency)}, up to {m.maxQuantityPerItem} each</dd>
        <dt>Categories</dt><dd><Tags items={m.allowedCategories} empty="" /></dd>
        <dt>Shops</dt><dd><Tags items={m.allowedMerchants} empty="any shop" /></dd>
        <dt>Alone</dt><dd>{m.autonomy.mode === "ask_always" ? "nothing, asks every time" : `buys carts under ${money(m.autonomy.thresholdCents, m.currency)}`}</dd>
        <dt>Expires</dt><dd><span title={new Date(m.expiresAt).toLocaleString()}>{v.status === "revoked" ? "revoked" : countdown(m.expiresAt, now)}</span></dd>
      </dl>
      <div className="actions tight">
        <a className="ghost small auditlink" href={`/api/mandates/${v.hash}/audit`} download title="The chain of signed contracts, every proposal under it and the trace">Download audit</a>
        {v.status === "active" && !confirm && <button className="ghost small danger" disabled={busy} onClick={() => setConfirm(true)}>Revoke</button>}
      </div>
      {confirm && (
        <div className="confirm" role="alertdialog" aria-label="Confirm revoke">
          <p><b>Revoke this contract?</b> Anything not yet paid under it stops at the next check. This cannot be undone.</p>
          <div className="actions tight">
            <button className="ghost small" onClick={() => setConfirm(false)}>Cancel</button>
            <button className="primary small danger-fill" disabled={busy} onClick={() => run(() => api.revoke(v.hash)).then((r) => { setConfirm(false); if (r) onChanged(); })}>Confirm revoke</button>
          </div>
        </div>
      )}
    </article>
  );
}

export function ContractsPanel({ config, contracts, drafts, amendments, busy, run, onChanged, onDraftSigned, onDiscardDraft, id }: {
  config: Config; contracts: MandateView[]; drafts: PendingDraft[]; amendments: Amendment[]; busy: boolean; run: RunFn; onChanged: () => void; onDraftSigned?: (draft: PendingDraft) => void; onDiscardDraft?: (draft: PendingDraft) => void; id?: string;
}) {
  const now = useNow();
  const pendingDrafts = drafts.filter((d) => d.status === "pending");
  const pendingAmendments = amendments.filter((a) => a.status === "pending");
  const sorted = sortContracts(contracts);
  const empty = sorted.length === 0 && pendingDrafts.length === 0;
  return (
    <section id={id} className="contracts" aria-label="Contracts">
      <div className="panehead"><h2><Icon name="shield" size={18} /> Contracts</h2></div>
      <div className="panebody">
        {pendingDrafts.map((d) => <DraftForm key={d.id} draft={d} config={config} busy={busy} run={run} onDone={onChanged} onSigned={onDraftSigned} onDiscard={onDiscardDraft} />)}
        {pendingAmendments.map((a) => <AmendmentDiff key={a.id} amendment={a} base={contracts.find((c) => c.hash === a.baseHash)} busy={busy} run={run} onDone={onChanged} />)}
        {sorted.map((v) => <ContractCard key={v.hash} v={v} busy={busy} run={run} onChanged={onChanged} now={now} />)}
        {empty && (
          <div className="emptystate">
            <b>No contracts yet.</b>
            <p className="muted small">Tell the agent what to buy and how much you can spend. It drafts a contract here for you to review and sign. Nothing can be spent before that.</p>
          </div>
        )}
      </div>
      <p className="ruleline" role="note"><Icon name="shield" size={14} /> {RULE_LINE}</p>
    </section>
  );
}

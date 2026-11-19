import { api, type Amendment, type MandateView } from "./api";
import { describeChange } from "./diff";
import type { RunFn } from "./useRun";

/** A proposed change to a signed contract, field by field. Signing creates a successor; the old contract is superseded. */
export function AmendmentDiff({ amendment: a, base, busy, run, onDone }: { amendment: Amendment; base?: MandateView; busy: boolean; run: RunFn; onDone: () => void }) {
  const cur = a.mandate.currency;
  return (
    <article className="card amendment" aria-label="Contract amendment to review">
      <div className="draftcap"><span className="statuschip draft">Amendment: not signed</span>{a.source === "agent" && <span className="fromagent">from the agent</span>}</div>
      <h3>Change this contract?</h3>
      {a.reason && <p className="reason">“{a.reason}”</p>}
      <table className="difftable">
        <thead><tr><th scope="col">Field</th><th scope="col">Now</th><th scope="col">After you sign</th></tr></thead>
        <tbody>
          {a.diff.map((d) => {
            const c = describeChange(d.field, d.before, d.after, cur);
            return <tr key={d.field}><th scope="row">{c.label}</th><td className="before">{c.before}</td><td className="after">{c.after}</td></tr>;
          })}
        </tbody>
      </table>
      <p className="muted small">
        {base ? <>The current contract <span className="mono">{base.hash}</span> will be superseded. </> : null}
        Money already spent still counts against the new budget.
      </p>
      <div className="actions">
        <button className="ghost" disabled={busy} onClick={() => run(() => api.rejectAmendment(a.id)).then((r) => r && onDone())}>Reject</button>
        <button className="primary" disabled={busy} onClick={() => run(() => api.signAmendment(a.id)).then((r) => r && onDone())}>Sign amendment</button>
      </div>
    </article>
  );
}

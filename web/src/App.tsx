import { useEffect, useState } from "react";
import { useRun, type RunFn } from "./useRun";
import { api, money, toCents, type Check, type Config, type Mandate, type Proposal, type SignedMandate, type TraceEvent } from "./api";

type Step = 0 | 1 | 2 | 3;
const STEPS = ["Mandate", "Ask", "Proposal", "Approve & pay"];
const CATEGORY_SUGGESTIONS = ["shoes", "socks", "balls", "bags", "clothing", "protection"];
const EXAMPLES = ["Indoor futsal shoes, size 43, non-marking sole, max 90 €", "Grip socks, max 15 €", "A futsal ball, size 4"];
const CHECK_LABEL: Record<Check["name"], string> = {
  total_budget: "Total budget", per_item_cap: "Per-item cap", category: "Category", merchant: "Merchant", quantity: "Quantity",
  expiry: "Mandate still valid", currency: "Currency", hard_attributes: "Required attributes", price_freshness: "Price is fresh", injection_flag: "Listing is clean",
};
const STATUS_LABEL: Record<Proposal["status"], string> = {
  blocked: "Blocked", pending: "Needs your approval", auto_approved: "Auto-approved", awaiting_buyer: "Waiting for the buyer", paid: "Paid", rejected: "Rejected", failed: "Stopped at checkout",
};

export default function App() {
  const [config, setConfig] = useState<Config>();
  const [step, setStep] = useState<Step>(0);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [note, setNote] = useState<string>();
  const { busy, error, setError, run } = useRun();

  const refresh = () => api.config().then(setConfig).catch((e) => setError(e.message));
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signed = config?.mandate ?? null;
  const selected = proposals.find((p) => p.id === selectedId);
  const upsert = (p: Proposal) => setProposals((all) => (all.some((x) => x.id === p.id) ? all.map((x) => (x.id === p.id ? p : x)) : [p, ...all]));
  const maxStep = !signed ? 0 : proposals.length === 0 ? 1 : selected ? 3 : 2;

  return (
    <div className="shell">
      <main>
        <header className="top">
          <div className="brand">
            <span className="logo" aria-hidden><i /><i /></span>
            <div>
              <h1>Mandate</h1>
              <p>Agents shouldn't be trusted with money. They should be trusted with a mandate.</p>
            </div>
          </div>
          {config && (
            <div className="badges">
              <span className={`badge ${config.demoMode === "mock" ? "" : "live"}`}>{config.demoMode === "mock" ? "Demo payments" : "PayPal sandbox"}</span>
              <span className="badge">Agent: {config.agent === "llm" ? "LLM" : "rules"}</span>
            </div>
          )}
        </header>

        <nav className="stepper">
          {STEPS.map((s, i) => (
            <button key={s} className={i === step ? "on" : i < step ? "done" : ""} disabled={i > maxStep} onClick={() => setStep(i as Step)} aria-current={i === step ? "step" : undefined}>
              <b>{i < step ? "✓" : i + 1}</b> <span>{s}</span>
            </button>
          ))}
        </nav>

        {error && <div className="alert" role="alert">{error}</div>}

        {step === 0 && config && <MandateStep config={config} signed={signed} busy={busy} run={run} onSigned={refresh} onNext={() => setStep(1)} />}
        {step === 1 && signed && (
          <AskStep
            busy={busy} run={run} note={note}
            onResult={(ps, summary) => { ps.forEach(upsert); setSelectedId(undefined); setNote(summary); if (ps.length) setStep(2); }}
            onAttack={(p) => { upsert(p); setStep(2); }}
          />
        )}
        {step === 2 && signed && <ProposalStep proposals={proposals} busy={busy} run={run} onReview={(id) => { setSelectedId(id); setStep(3); }} onAttack={upsert} onAskAgain={() => setStep(1)} />}
        {step === 3 && selected && config && <PayStep p={selected} config={config} busy={busy} run={run} onChange={upsert} onAskAgain={() => setStep(1)} />}

        {config?.resettable && (
          <footer className="foot">
            <button className="linklike" disabled={busy} onClick={() => run(() => api.reset()).then((r) => { if (r) { setProposals([]); setSelectedId(undefined); setNote(undefined); setStep(signed ? 1 : 0); } })}>
              Reset demo
            </button>
          </footer>
        )}
      </main>
      <TracePanel active={Boolean(signed)} />
    </div>
  );
}

/* ---------- 1. Mandate ---------- */
const HOURS = [{ label: "1 hour", h: 1 }, { label: "4 hours", h: 4 }, { label: "24 hours", h: 24 }];

function MandateStep({ config, signed, busy, run, onSigned, onNext }: { config: Config; signed: SignedMandate | null; busy: boolean; run: RunFn; onSigned: () => void; onNext: () => void }) {
  const cur = signed?.mandate;
  const eur = (c: number) => String(c / 100);
  const [budget, setBudget] = useState(cur ? eur(cur.totalBudgetCents) : "90");
  const [cap, setCap] = useState(cur ? eur(cur.perItemCapCents) : "90");
  const [cats, setCats] = useState(cur ? cur.allowedCategories.join(", ") : "shoes");
  const [merchants, setMerchants] = useState(cur?.allowedMerchants?.join(", ") ?? "");
  const [qty, setQty] = useState(String(cur?.maxQuantityPerItem ?? 1));
  const [hours, setHours] = useState(24);
  const [auto, setAuto] = useState(cur?.autonomy.mode === "auto_under");
  const [threshold, setThreshold] = useState(cur?.autonomy.mode === "auto_under" ? eur(cur.autonomy.thresholdCents) : "30");

  const list = (s: string) => s.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const toggleCat = (c: string) => setCats(list(cats).includes(c) ? list(cats).filter((x) => x !== c).join(", ") : [...list(cats), c].join(", "));
  const mandate = (): Mandate => ({
    currency: config.currency,
    totalBudgetCents: toCents(budget),
    perItemCapCents: toCents(cap),
    allowedCategories: list(cats),
    ...(list(merchants).length ? { allowedMerchants: list(merchants) } : {}),
    maxQuantityPerItem: Number(qty),
    expiresAt: new Date(Date.now() + hours * 3600 * 1000).toISOString(),
    autonomy: auto ? { mode: "auto_under", thresholdCents: toCents(threshold) } : { mode: "ask_always" },
  });
  const m = mandate();
  const valid = m.totalBudgetCents > 0 && m.perItemCapCents > 0 && m.allowedCategories.length > 0 && Number.isInteger(m.maxQuantityPerItem) && m.maxQuantityPerItem >= 1 && (!auto || m.autonomy.mode !== "auto_under" || m.autonomy.thresholdCents > 0);

  return (
    <section className="card">
      <h2>Set the mandate</h2>
      <p className="muted hint">What the agent may spend, on what, and what it may do without asking. Anything outside it waits for you.</p>
      <div className="mform">
        <label>Total budget ({config.currency})<input className="money" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} /></label>
        <label>Max per item ({config.currency})<input className="money" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} /></label>
        <label>Max quantity per item<input className="money" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
        <label>Valid for
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>{HOURS.map((o) => <option key={o.h} value={o.h}>{o.label}</option>)}</select>
        </label>
        <label className="wide">Allowed categories
          <input value={cats} onChange={(e) => setCats(e.target.value)} placeholder="shoes, socks" />
          <span className="chips">{CATEGORY_SUGGESTIONS.map((c) => <button type="button" key={c} className={`chip ${list(cats).includes(c) ? "sel" : ""}`} onClick={() => toggleCat(c)}>{c}</button>)}</span>
        </label>
        <label className="wide">Allowed merchants <span className="muted">(optional, any if empty)</span>
          <input value={merchants} onChange={(e) => setMerchants(e.target.value)} placeholder="futsalstore.example" />
        </label>
        <fieldset className="wide autonomy">
          <legend>What may the agent do alone?</legend>
          <label className={`opt ${!auto ? "on" : ""}`}><input type="radio" name="auto" checked={!auto} onChange={() => setAuto(false)} /> Nothing: ask me every time</label>
          <label className={`opt ${auto ? "on" : ""}`}>
            <input type="radio" name="auto" checked={auto} onChange={() => setAuto(true)} /> Buy alone when the cart is under
            <input className="money inline" inputMode="decimal" aria-label="Auto-approve threshold" value={threshold} onChange={(e) => setThreshold(e.target.value)} disabled={!auto} /> {config.currency}
          </label>
        </fieldset>
      </div>

      {signed && <Seal signed={signed} />}

      <div className="actions">
        {signed && <button className="ghost" onClick={onNext} disabled={busy}>Keep this mandate</button>}
        <button className="primary" disabled={busy || !valid} onClick={() => run(() => api.setMandate(m)).then((r) => { if (r) { onSigned(); onNext(); } })}>
          {signed ? "Sign a new mandate" : "Sign mandate"}
        </button>
      </div>
    </section>
  );
}

/** The signed mandate, drawn as the document it is. */
function Seal({ signed }: { signed: SignedMandate }) {
  const m = signed.mandate;
  return (
    <div className="seal" aria-label="Signed mandate">
      <div className="seal-hash"><span className="muted small">signed</span><b className="mono">{signed.hash}</b></div>
      <dl>
        <dt>Budget</dt><dd>{money(m.totalBudgetCents, m.currency)}</dd>
        <dt>Per item</dt><dd>{money(m.perItemCapCents, m.currency)}</dd>
        <dt>Categories</dt><dd>{m.allowedCategories.join(", ")}</dd>
        {m.allowedMerchants?.length ? <><dt>Merchants</dt><dd>{m.allowedMerchants.join(", ")}</dd></> : null}
        <dt>Quantity</dt><dd>up to {m.maxQuantityPerItem} per item</dd>
        <dt>Expires</dt><dd>{new Date(m.expiresAt).toLocaleString()}</dd>
        <dt>Alone</dt><dd>{m.autonomy.mode === "ask_always" ? "nothing, asks every time" : `buys carts under ${money(m.autonomy.thresholdCents, m.currency)}`}</dd>
      </dl>
    </div>
  );
}

/* ---------- 2. Ask ---------- */
function AskStep({ busy, run, note, onResult, onAttack }: { busy: boolean; run: RunFn; note?: string; onResult: (ps: Proposal[], summary: string) => void; onAttack: (p: Proposal) => void }) {
  const [text, setText] = useState(EXAMPLES[0]);
  return (
    <section className="card">
      <h2>What should it buy?</h2>
      <p className="muted hint">Say it in your own words. The agent searches real catalogs and proposes a cart. It cannot pay.</p>
      <textarea className="ask" rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label="What should the agent buy?" />
      <div className="chips">{EXAMPLES.map((x) => <button key={x} className="chip ghost" onClick={() => setText(x)}>{x}</button>)}</div>
      {busy && <p className="muted" role="status">Searching…</p>}
      {note && !busy && <div className="alert warn">{note}</div>}
      <div className="actions">
        <AttackButton busy={busy} run={run} onAttack={onAttack} />
        <button className="primary" disabled={busy || text.trim().length < 2} onClick={() => run(() => api.ask(text.trim())).then((r) => r && onResult(r.proposals, r.run.summary))}>Find options</button>
      </div>
    </section>
  );
}

function AttackButton({ busy, run, onAttack }: { busy: boolean; run: RunFn; onAttack: (p: Proposal) => void }) {
  return (
    <button className="ghost danger" disabled={busy} onClick={() => run(() => api.attack()).then((p) => p && onAttack(p))} title="Loads a poisoned listing that tells the agent to buy 10 units">
      Try an attack
    </button>
  );
}

/* ---------- 3. Proposal ---------- */
function ProposalStep({ proposals, busy, run, onReview, onAttack, onAskAgain }: { proposals: Proposal[]; busy: boolean; run: RunFn; onReview: (id: string) => void; onAttack: (p: Proposal) => void; onAskAgain: () => void }) {
  return (
    <section>
      <div className="card head">
        <h2>Proposals</h2>
        <p className="muted hint">Every cart is checked by code outside the model before anyone can approve it.</p>
        <div className="actions tight"><button className="ghost" onClick={onAskAgain}>Ask again</button><AttackButton busy={busy} run={run} onAttack={onAttack} /></div>
      </div>
      {proposals.map((p) => <ProposalCard key={p.id} p={p} onReview={p.blocked ? undefined : () => onReview(p.id)} />)}
    </section>
  );
}

function ProposalCard({ p, onReview }: { p: Proposal; onReview?: () => void }) {
  const failed = p.checks.filter((c) => !c.ok);
  return (
    <article className={`card proposal ${p.blocked ? "blocked" : ""}`}>
      <div className="phead">
        <span className={`pstatus ${p.status}`}>{STATUS_LABEL[p.status]}</span>
        {p.source === "attack" && <span className="badge live">Attack demo</span>}
        {p.autoApproved && <span className="badge good">Approved by the mandate</span>}
      </div>
      <ul className="lines">
        {p.lines.map((l) => (
          <li key={l.productId}>
            <div><b>{l.title}</b><span className="muted"> · {l.merchant}</span>{l.quantity !== 1 && <span className="qty"> ×{l.quantity}</span>}</div>
            <div className="amt">{money(l.priceCents * l.quantity, l.currency)}</div>
            <div className="muted small why">{l.reason}</div>
          </li>
        ))}
      </ul>
      {p.summary && <p className="muted small">{p.summary}</p>}
      <ul className="checks" aria-label="Guardrail checks">
        {p.checks.map((c) => (
          <li key={c.name} className={c.ok ? "pass" : "fail"}>
            <span className="mark" aria-hidden>{c.ok ? "✓" : "✗"}</span>
            <span className="cname">{CHECK_LABEL[c.name]}</span>
            {!c.ok && <span className="creason">{c.reason}</span>}
            <span className="sr-only">{c.ok ? "passed" : "failed"}</span>
          </li>
        ))}
      </ul>
      {p.blocked && <div className="alert">Blocked by {failed.length} guardrail{failed.length === 1 ? "" : "s"}. Nothing can be approved or paid. The model can be fooled; this check cannot.</div>}
      {onReview && <div className="actions"><button className="primary" onClick={onReview}>{p.status === "paid" ? "View receipt" : `Review ${money(p.totalCents, p.currency)}`}</button></div>}
    </article>
  );
}

/* ---------- 4. Approve & pay ---------- */
function PayStep({ p, config, busy, run, onChange, onAskAgain }: { p: Proposal; config: Config; busy: boolean; run: RunFn; onChange: (p: Proposal) => void; onAskAgain: () => void }) {
  const mock = config.demoMode === "mock";
  const link = p.order?.approveUrl?.startsWith("http") ? p.order.approveUrl : undefined;
  return (
    <section>
      <ProposalCard p={p} />
      <div className="card">
        {p.status === "pending" && (
          <>
            <h2>Approve this purchase?</h2>
            <p className="muted hint">Nothing has been paid. Approving creates the order; the price and the mandate are checked again first.</p>
            <div className="actions">
              <button className="ghost" disabled={busy} onClick={() => run(() => api.reject(p.id)).then((r) => r && onChange(r))}>Reject</button>
              <button className="primary" disabled={busy} onClick={() => run(() => api.approve(p.id)).then((r) => r && onChange(r))}>Approve {money(p.totalCents, p.currency)}</button>
            </div>
          </>
        )}
        {(p.status === "awaiting_buyer" || p.status === "auto_approved") && p.order && (
          <>
            <h2>{mock ? "Order created" : "Waiting for the buyer"}</h2>
            <p className="muted hint">{mock ? "Demo mode: simulate the buyer approving on PayPal, then capture the payment." : "Open PayPal, approve with the sandbox buyer account, then capture the payment here."}</p>
            {link && <p><a href={link} target="_blank" rel="noreferrer">Approve in PayPal sandbox ↗</a></p>}
            <div className="actions">
              <button className="primary" disabled={busy} onClick={() => run(() => api.pay(p.id)).then((r) => r && onChange(r))}>{mock ? "Simulate buyer and pay" : "Capture payment"}</button>
            </div>
          </>
        )}
        {p.status === "paid" && (
          <div className="receipt">
            <h2>Paid <span className="badge good">{p.autoApproved ? "by the mandate" : "approved by you"}</span></h2>
            <dl>
              <dt>Amount</dt><dd className="mono">{money(p.totalCents, p.currency)}</dd>
              <dt>Order</dt><dd className="mono">{p.order?.id}</dd>
              <dt>Capture</dt><dd className="mono">{p.order?.captureId ?? "n/a"}</dd>
              <dt>Mandate</dt><dd className="mono">{p.mandateHash}</dd>
            </dl>
            <div className="actions"><button className="primary" onClick={onAskAgain}>Buy something else</button></div>
          </div>
        )}
        {p.status === "failed" && (
          <>
            <h2>Stopped at checkout</h2>
            <div className="alert">{p.error}</div>
            <p className="muted hint">The guardrails ran again with live data and refused. No money moved.</p>
            <div className="actions"><button className="primary" onClick={onAskAgain}>Ask again</button></div>
          </>
        )}
        {p.status === "rejected" && (
          <>
            <h2>Rejected</h2>
            <p className="muted hint">Nothing was paid.</p>
            <div className="actions"><button className="primary" onClick={onAskAgain}>Ask again</button></div>
          </>
        )}
      </div>
    </section>
  );
}

/* ---------- Trace panel ---------- */
function TracePanel({ active }: { active: boolean }) {
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState<number>();
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const tick = () => api.trace().then((e) => alive && setEvents(e)).catch(() => {});
    tick();
    const t = setInterval(tick, 1500);
    return () => { alive = false; clearInterval(t); };
  }, [active]);
  const shown = events.filter((e) => filter === "all" || e.kind === filter);
  return (
    <aside className="trace">
      <h2>Trace</h2>
      <p className="muted small">Every model call, tool call, guardrail decision, approval and PayPal response (JSONL).</p>
      <div className="chips">
        {["all", "llm", "tool", "decision", "approval", "error"].map((k) => (
          <button key={k} className={`chip ${filter === k ? "sel" : ""}`} onClick={() => setFilter(k)}>{k}</button>
        ))}
      </div>
      <ol>
        {shown.slice().reverse().map((e, i) => (
          <li key={`${e.ts}-${i}`} className={`ev ${e.kind}`} onClick={() => setOpen(open === i ? undefined : i)}>
            <div className="evh"><span className="kindtag">{e.kind}</span> <b>{e.step}</b> <time>{new Date(e.ts).toLocaleTimeString()}</time></div>
            {e.error && <div className="everr">{e.error}</div>}
            {open === i && <pre>{JSON.stringify({ args: e.args, result: e.result }, null, 2)}</pre>}
          </li>
        ))}
        {!active && <li className="muted">Sign a mandate to start.</li>}
      </ol>
    </aside>
  );
}

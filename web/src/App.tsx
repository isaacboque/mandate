import { useEffect, useState } from "react";
import { useRun, type RunFn } from "./useRun";
import { api, money, toCents, type Check, type Config, type Mandate, type NearMiss, type Proposal, type SignedMandate, type TraceEvent } from "./api";
import { Icon } from "./icons";

type Step = 0 | 1 | 2 | 3;
const STEPS = ["Mandate", "Ask", "Proposal", "Approve & pay"];
const CHECK_LABEL: Record<Check["name"], string> = {
  total_budget: "Total budget", per_item_cap: "Per-item cap", category: "Category", merchant: "Merchant", quantity: "Quantity",
  expiry: "Mandate still valid", currency: "Currency", hard_attributes: "Required attributes", price_freshness: "Price is fresh", injection_flag: "Listing is clean",
};
const STATUS_LABEL: Record<Proposal["status"], string> = {
  blocked: "Blocked", pending: "Needs your approval", auto_approved: "Approved by the mandate", awaiting_buyer: "Waiting for the buyer", paid: "Paid", rejected: "Rejected", failed: "Stopped at checkout",
};
const symbol = (currency: string) => new Intl.NumberFormat("en", { style: "currency", currency }).formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;

export default function App() {
  const [config, setConfig] = useState<Config>();
  const [step, setStep] = useState<Step>(0);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [note, setNote] = useState<string>();
  const [nearMisses, setNearMisses] = useState<NearMiss[]>([]);
  const [traceOpen, setTraceOpen] = useState(true);
  const { busy, error, setError, run } = useRun();

  const refresh = () => api.config().then(setConfig).catch((e) => setError(e.message));
  // Reloading the page must not lose the session: restore the mandate and the proposals from the server.
  useEffect(() => {
    Promise.all([api.config(), api.proposals()])
      .then(([c, ps]) => {
        setConfig(c);
        const list = ps.slice().reverse();
        setProposals(list);
        // The buyer comes back from PayPal to /?paypal=return (or cancel): open the purchase that is waiting.
        const back = new URLSearchParams(window.location.search).get("paypal");
        if (back) window.history.replaceState({}, "", window.location.pathname);
        const waiting = list.find((p) => p.status === "awaiting_buyer");
        if (back && waiting) {
          setSelectedId(waiting.id);
          setStep(3);
          if (back === "cancel") setError("You cancelled in PayPal. The order is still waiting: open the PayPal link again to approve it.");
        } else if (c.mandate) setStep(ps.length ? 2 : 1);
      })
      .catch((e) => setError(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signed = config?.mandate ?? null;
  const selected = proposals.find((p) => p.id === selectedId);
  const change = (p: Proposal) => { upsert(p); refresh(); };
  const upsert = (p: Proposal) => setProposals((all) => (all.some((x) => x.id === p.id) ? all.map((x) => (x.id === p.id ? p : x)) : [p, ...all]));
  const maxStep = !signed ? 0 : proposals.length === 0 ? 1 : selected ? 3 : 2;

  return (
    <div className={`shell ${traceOpen ? "" : "notrace"}`}>
      <main>
        <header className="top">
          <div className="brand">
            <span className="logo" aria-hidden><i /><i /></span>
            <div>
              <h1>Mandate</h1>
              <p>Agents shouldn't be trusted with money. They should be trusted with a mandate.</p>
            </div>
          </div>
          <div className="badges">
            {config && <span className={`badge ${config.demoMode === "mock" ? "" : "live"}`}>{config.demoMode === "mock" ? "Demo payments" : "PayPal sandbox"}</span>}
            {config && <span className="badge">Agent: {config.agent === "llm" ? "AI model" : "rules"}</span>}
            <button className="ghost small" onClick={() => setTraceOpen((o) => !o)} aria-pressed={traceOpen}>{traceOpen ? "Hide trace" : "Show trace"}</button>
          </div>
        </header>

        <nav className="stepper" aria-label="Progress">
          {STEPS.map((s, i) => (
            <button key={s} className={i === step ? "on" : i < step ? "done" : ""} disabled={i > maxStep} onClick={() => setStep(i as Step)} aria-current={i === step ? "step" : undefined}>
              <b>{i < step ? <Icon name="check" size={14} /> : i + 1}</b> <span>{s}</span>
            </button>
          ))}
        </nav>

        {error && <div className="alert" role="alert">{error}</div>}

        {step === 0 && config && <MandateStep config={config} signed={signed} busy={busy} run={run} onSigned={refresh} onNext={() => setStep(1)} />}
        {step === 1 && signed && config && (
          <AskStep
            config={config} signed={signed} busy={busy} run={run} note={note} nearMisses={nearMisses} onSigned={refresh}
            onResult={(ps, summary, misses) => { ps.forEach(upsert); setSelectedId(undefined); setNote(summary); setNearMisses(misses); refresh(); if (ps.length) setStep(2); }}
            onAttack={(p) => { upsert(p); setStep(2); }}
          />
        )}
        {step === 2 && signed && <ProposalStep proposals={proposals} busy={busy} run={run} onReview={(id) => { setSelectedId(id); setStep(3); }} onAttack={upsert} onAskAgain={() => setStep(1)} />}
        {step === 3 && selected && config && <PayStep p={selected} config={config} busy={busy} run={run} onChange={change} onAskAgain={() => setStep(1)} />}

        {config?.resettable && (
          <footer className="foot">
            <button className="linklike" disabled={busy} onClick={() => run(() => api.reset()).then((r) => { if (r) { setProposals([]); setSelectedId(undefined); setNote(undefined); setNearMisses([]); refresh(); setStep(signed ? 1 : 0); } })}>
              Reset demo
            </button>
          </footer>
        )}
      </main>
      {traceOpen && <TracePanel active={Boolean(signed)} />}
    </div>
  );
}

/* ---------- 1. Mandate ---------- */
const HOURS = [{ label: "1 hour", h: 1 }, { label: "4 hours", h: 4 }, { label: "24 hours", h: 24 }];

/** The mandate in one plain sentence, for people who do not read JSON. */
function describeMandate(m: Mandate): string {
  const cur = m.currency;
  const where = m.allowedMerchants?.length ? `only from ${m.allowedMerchants.join(", ")}` : "from any shop";
  const alone = m.autonomy.mode === "ask_always" ? "It asks you before every purchase." : `It may buy alone when the cart is under ${money(m.autonomy.thresholdCents, cur)}; anything above waits for you.`;
  return `Up to ${money(m.totalBudgetCents, cur)} in total, ${money(m.perItemCapCents, cur)} per item, at most ${m.maxQuantityPerItem} of each. Only ${m.allowedCategories.join(", ")}, ${where}. ${alone}`;
}

function MandateStep({ config, signed, busy, run, onSigned, onNext }: { config: Config; signed: SignedMandate | null; busy: boolean; run: RunFn; onSigned: () => void; onNext: () => void }) {
  const live = config.demoMode === "live";
  const sym = symbol(config.currency);
  const shoeCats = live ? "athletic-shoes, soccer-shoes, sneakers" : "shoes";
  const cur = signed?.mandate;
  const eur = (c: number) => String(c / 100);
  const [budget, setBudget] = useState(cur ? eur(cur.totalBudgetCents) : "100");
  const [cap, setCap] = useState(cur ? eur(cur.perItemCapCents) : "100");
  const [cats, setCats] = useState(cur ? cur.allowedCategories.join(", ") : shoeCats);
  const [merchants, setMerchants] = useState(cur?.allowedMerchants?.join(", ") ?? "");
  const [qty, setQty] = useState(String(cur?.maxQuantityPerItem ?? 1));
  const [hours, setHours] = useState(24);
  const [auto, setAuto] = useState(cur?.autonomy.mode === "auto_under");
  const [threshold, setThreshold] = useState(cur?.autonomy.mode === "auto_under" ? eur(cur.autonomy.thresholdCents) : "50");

  const list = (s: string) => s.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
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
  const problems: string[] = [];
  if (!(m.totalBudgetCents > 0)) problems.push("Enter a total budget above 0.");
  if (!(m.perItemCapCents > 0)) problems.push("Enter a per-item cap above 0.");
  if (m.allowedCategories.length === 0) problems.push("Add at least one category.");
  if (!Number.isInteger(m.maxQuantityPerItem) || m.maxQuantityPerItem < 1) problems.push("Quantity must be a whole number, 1 or more.");
  if (auto && !(toCents(threshold) > 0)) problems.push("Enter the amount under which it may buy alone.");
  const hints: string[] = [];
  if (m.perItemCapCents > m.totalBudgetCents) hints.push("The per-item cap is above the total budget, so the total is the real limit.");
  if (auto && toCents(threshold) > m.totalBudgetCents) hints.push("The auto-buy amount is above the total budget.");

  const presets = [
    { name: "One pair of shoes", note: `Up to ${sym}100. Asks you first.`, set: () => { setBudget("100"); setCap("100"); setQty("1"); setCats(shoeCats); setMerchants(""); setAuto(false); } },
    live
      ? { name: "A cheap pair, buys alone", note: `Up to ${sym}60. Buys alone under ${sym}50.`, set: () => { setBudget("60"); setCap("60"); setQty("1"); setCats(shoeCats); setMerchants(""); setAuto(true); setThreshold("50"); } }
      : { name: "Small extras, buys alone", note: `Up to ${sym}60. Buys alone under ${sym}30.`, set: () => { setBudget("60"); setCap("40"); setQty("2"); setCats("socks, balls"); setMerchants(""); setAuto(true); setThreshold("30"); } },
  ];

  return (
    <section className="card">
      <h2>Set the mandate</h2>
      <p className="muted hint">What the agent may spend, on what, and what it may do without asking. Anything outside it waits for you.</p>

      <div className="presets" role="group" aria-label="Start from a preset">
        {presets.map((p) => (
          <button key={p.name} type="button" className="preset" onClick={p.set}><b>{p.name}</b><span>{p.note}</span></button>
        ))}
      </div>

      <div className="mform">
        <fieldset className="fgroup">
          <legend>Spending limits</legend>
          <label>Total budget<span className="cur"><i>{sym}</i><input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} /></span></label>
          <label>Max per item<span className="cur"><i>{sym}</i><input inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} /></span></label>
          <label>Max quantity per item<input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
          <label>Valid for
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>{HOURS.map((o) => <option key={o.h} value={o.h}>{o.label}</option>)}</select>
          </label>
        </fieldset>

        <fieldset className="fgroup">
          <legend>What it may buy</legend>
          <label className="wide"><span>Categories <span className="muted">(comma separated)</span></span>
            <input value={cats} onChange={(e) => setCats(e.target.value)} placeholder={shoeCats} />
          </label>
          <label className="wide"><span>Shops <span className="muted">(optional, any shop if empty)</span></span>
            <input value={merchants} onChange={(e) => setMerchants(e.target.value)} placeholder={live ? "shoebacca.com, dickssportinggoods.com" : "futsalstore.example"} />
          </label>
        </fieldset>

        <fieldset className="fgroup autonomy">
          <legend>What may it do alone?</legend>
          <label className={`opt ${!auto ? "on" : ""}`}><input type="radio" name="auto" checked={!auto} onChange={() => setAuto(false)} /> Nothing: ask me every time</label>
          <label className={`opt ${auto ? "on" : ""}`}>
            <input type="radio" name="auto" checked={auto} onChange={() => setAuto(true)} /> Buy alone when the cart is under
            <span className="cur inline"><i>{sym}</i><input inputMode="decimal" aria-label="Auto-buy amount" value={threshold} onChange={(e) => setThreshold(e.target.value)} disabled={!auto} /></span>
          </label>
        </fieldset>
      </div>

      {hints.map((h) => <p key={h} className="hintline">{h}</p>)}
      <p className="sentence" aria-live="polite">{problems.length ? problems[0] : describeMandate(m)}</p>

      {signed && <Seal signed={signed} spentCents={config.spentCents} />}

      <div className="actions">
        {signed && <button className="ghost" onClick={onNext} disabled={busy}>Keep the signed mandate</button>}
        <button className="primary" disabled={busy || problems.length > 0} onClick={() => run(() => api.setMandate(m)).then((r) => { if (r) { onSigned(); onNext(); } })}>
          {signed ? "Sign a new mandate" : "Sign mandate"}
        </button>
      </div>
    </section>
  );
}

/** The signed mandate, drawn as the document it is. */
function Seal({ signed, spentCents = 0 }: { signed: SignedMandate; spentCents?: number }) {
  const m = signed.mandate;
  return (
    <div className="seal" aria-label="Signed mandate">
      <div className="seal-hash"><span className="seal-title"><Icon name="shield" size={16} /> Signed mandate</span><b className="mono">{signed.hash}</b></div>
      <dl>
        <dt>Budget</dt><dd>{money(m.totalBudgetCents, m.currency)}{spentCents > 0 && <span className="left"> · {money(Math.max(m.totalBudgetCents - spentCents, 0), m.currency)} left</span>}</dd>
        <dt>Per item</dt><dd>{money(m.perItemCapCents, m.currency)}</dd>
        <dt>Categories</dt><dd>{m.allowedCategories.join(", ")}</dd>
        {m.allowedMerchants?.length ? <><dt>Shops</dt><dd>{m.allowedMerchants.join(", ")}</dd></> : null}
        <dt>Quantity</dt><dd>up to {m.maxQuantityPerItem} per item</dd>
        <dt>Expires</dt><dd>{new Date(m.expiresAt).toLocaleString()}</dd>
        <dt>Alone</dt><dd>{m.autonomy.mode === "ask_always" ? "nothing, asks every time" : `buys carts under ${money(m.autonomy.thresholdCents, m.currency)}`}</dd>
      </dl>
    </div>
  );
}

/* ---------- 2. Ask ---------- */
function AskStep({ config, signed, busy, run, note, nearMisses, onSigned, onResult, onAttack }: { config: Config; signed: SignedMandate; busy: boolean; run: RunFn; note?: string; nearMisses: NearMiss[]; onSigned: () => void; onResult: (ps: Proposal[], summary: string, misses: NearMiss[]) => void; onAttack: (p: Proposal) => void }) {
  const sym = symbol(config.currency);
  const live = config.demoMode === "live";
  const examples = live
    ? [
        { text: `Indoor futsal shoes for men, max ${sym}90`, hint: "Inside the mandate" },
        { text: `Running shoes for men, max ${sym}70`, hint: "Inside the mandate" },
        { text: `Wireless earbuds under ${sym}60`, hint: "Outside the mandate: should not be proposed" },
      ]
    : [
        { text: "Indoor futsal shoes, size 43, non-marking sole, max 90 €", hint: "Needs the shoes mandate" },
        { text: "Grip socks, max 15 €", hint: "Needs socks in the mandate" },
        { text: "A futsal ball, size 4", hint: "Needs balls in the mandate" },
      ];
  const [text, setText] = useState(examples[0].text);
  const submit = () => run(() => api.ask(text.trim())).then((r) => r && onResult(r.proposals, r.run.summary, r.nearMisses));
  /** The person widens their own mandate (it is re-signed, with a new hash) and the search runs again. */
  const applyFix = (n: NearMiss) => run(async () => {
    if (!n.fix) return undefined;
    await api.setMandate({ ...signed.mandate, ...n.fix.patch });
    onSigned();
    return api.ask(text.trim());
  }).then((r) => r && onResult(r.proposals, r.run.summary, r.nearMisses));
  return (
    <section className="card">
      <h2>What should it buy?</h2>
      <p className="muted hint">Say it in your own words. The agent searches the catalog and proposes a cart. It cannot pay.</p>
      <textarea
        className="ask" rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label="What should the agent buy?"
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !busy && text.trim().length >= 2) submit(); }}
      />
      <div className="examples" role="group" aria-label="Examples">
        {examples.map((x) => (
          <button key={x.text} className={`example ${x.text === text ? "on" : ""}`} onClick={() => setText(x.text)}><b>{x.text}</b><span>{x.hint}</span></button>
        ))}
      </div>
      {busy && <Working live={live && config.agent === "llm"} />}
      {note && !busy && <div className="alert warn" role="status">{note}</div>}
      {!busy && nearMisses.length > 0 && <NearMisses items={nearMisses} onFix={applyFix} />}
      <div className="actions">
        <AttackButton busy={busy} run={run} onAttack={onAttack} />
        <button className="primary" disabled={busy || text.trim().length < 2} onClick={submit}>Find options</button>
      </div>
    </section>
  );
}

/** Honest waiting state: we do not fake progress, we say what is going on and how long it can take. */
function Working({ live }: { live: boolean }) {
  const [s, setS] = useState(0);
  useEffect(() => { const t = setInterval(() => setS((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  return (
    <div className="working" role="status">
      <span className="spinner" aria-hidden />
      <div>
        <b>The agent is searching and choosing… {s}s</b>
        <p className="muted small">{live ? "With a live AI model this can take 10 to 20 seconds. Every step shows in the trace." : "This should take a moment."}</p>
      </div>
    </div>
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

function Thumb({ src, title }: { src?: string; title: string }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) return <img className="thumb" src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
  return <span className="thumb ph" aria-hidden>{title.trim().charAt(0).toUpperCase() || "?"}</span>;
}

/** Only real http(s) links; the demo catalog's ".example" shops do not exist, so they are not linked. */
const safeHref = (u: string) => (/^https?:\/\/(?![^/]*\.example(?:[:/]|$))/i.test(u) ? u : undefined);

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

function ProposalCard({ p, onReview }: { p: Proposal; onReview?: () => void }) {
  const failed = p.checks.filter((c) => !c.ok);
  const passed = p.checks.filter((c) => c.ok);
  return (
    <article className={`card pcard ${p.blocked ? "blocked" : ""}`}>
      <div className={`verdict ${p.blocked ? "bad" : "good"}`}>
        <Icon name={p.blocked ? "cross" : "shield"} size={18} />
        <b>{p.blocked ? `Blocked: ${failed.length} of ${p.checks.length} checks failed` : `Inside your mandate: ${passed.length} of ${p.checks.length} checks passed`}</b>
      </div>
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
      {p.summary && <p className="muted small summary">{p.summary}</p>}

      {failed.length > 0 && <ul className="checks failures" aria-label="Failed guardrail checks">{failed.map((c, i) => <CheckRow key={c.name} c={c} i={i} />)}</ul>}
      {passed.length > 0 && (
        <details className="passed" open={p.status === "pending" || p.blocked}>
          <summary>{passed.length === p.checks.length ? "All 10 guardrail checks passed" : `${passed.length} checks passed`}</summary>
          <ul className="checks" aria-label="Passed guardrail checks">{passed.map((c, i) => <CheckRow key={c.name} c={c} i={i} />)}</ul>
        </details>
      )}
      {p.blocked && <p className="blockedmsg">Nothing can be approved or paid. The model can be fooled; this check cannot.</p>}
      {onReview && <div className="actions"><button className="primary" onClick={onReview}>{p.status === "paid" ? "View receipt" : p.status === "pending" ? `Review ${money(p.totalCents, p.currency)}` : "See progress"}</button></div>}
    </article>
  );
}

/* ---------- 4. Approve & pay ---------- */
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

function PayStep({ p, config, busy, run, onChange, onAskAgain }: { p: Proposal; config: Config; busy: boolean; run: RunFn; onChange: (p: Proposal) => void; onAskAgain: () => void }) {
  const mock = config.demoMode === "mock";
  const link = p.order?.approveUrl?.startsWith("http") ? p.order.approveUrl : undefined;
  return (
    <section>
      <div className="card"><Timeline p={p} /></div>
      <ProposalCard p={p} />
      <div className="card">
        {p.status === "pending" && (
          <>
            <h2>Approve this purchase?</h2>
            <p className="muted hint">Nothing has been paid. Approving creates the order, after the price and the mandate are checked again.</p>
            <div className="actions">
              <button className="ghost" disabled={busy} onClick={() => run(() => api.reject(p.id)).then((r) => r && onChange(r))}>Reject</button>
              <button className="primary" disabled={busy} onClick={() => run(() => api.approve(p.id)).then((r) => r && onChange(r))}>Approve {money(p.totalCents, p.currency)}</button>
            </div>
          </>
        )}
        {(p.status === "awaiting_buyer" || p.status === "auto_approved") && p.order && (
          <>
            <h2>{mock ? "Order created" : "Now the buyer approves on PayPal"}</h2>
            <p className="muted hint">{mock ? "Demo mode: simulate the buyer approving on PayPal, then capture the payment." : "Open PayPal, approve with the sandbox buyer account, come back and capture the payment."}</p>
            {link && <p><a className="paylink" href={link} target="_blank" rel="noreferrer noopener"><Icon name="external" size={15} /> Approve in PayPal sandbox</a></p>}
            <div className="actions">
              <button className="primary" disabled={busy} onClick={() => run(() => api.pay(p.id)).then((r) => r && onChange(r))}>{mock ? "Simulate buyer and pay" : "Capture payment"}</button>
            </div>
          </>
        )}
        {p.status === "paid" && (
          <div className="receipt">
            <h2>Paid <span className="badge good">{p.autoApproved ? "by the mandate" : "approved by you"}</span></h2>
            <p className="bigamt mono">{money(p.totalCents, p.currency)}</p>
            <dl>
              <dt>Bought</dt><dd>{p.lines.map((l) => `${l.title}${l.quantity !== 1 ? ` ×${l.quantity}` : ""}`).join(", ")}</dd>
              <dt>Order</dt><dd className="mono">{p.order?.id}</dd>
              <dt>Capture</dt><dd className="mono">{p.order?.captureId ?? "n/a"}</dd>
              <dt>Mandate</dt><dd className="mono">{p.mandateHash}</dd>
            </dl>
            <div className="actions">
              <a className="ghost auditlink" href={`/api/proposals/${p.id}/audit`} download>Download audit (JSON)</a>
              <button className="primary" onClick={onAskAgain}>Buy something else</button>
            </div>
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
    case "demo.reset": return "Demo reset";
    default: return e.step.startsWith("paypal.") || e.step.startsWith("payments.") ? `Payments: ${e.step.split(".").slice(1).join(" ")}` : e.step;
  }
}

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
    <aside className="trace" aria-label="Trace">
      <h2>Trace</h2>
      <p className="muted small">Everything the agent, the guardrails and PayPal did, in order. Click an event for the raw JSON.</p>
      <div className="chips">
        {["all", "llm", "tool", "decision", "approval", "error"].map((k) => (
          <button key={k} className={`chip ${filter === k ? "sel" : ""}`} onClick={() => setFilter(k)}>{k}</button>
        ))}
      </div>
      <ol>
        {shown.slice().reverse().map((e, i) => (
          <li key={`${e.ts}-${i}`} className={`ev ${e.kind}`}>
            <button className="evbtn" onClick={() => setOpen(open === i ? undefined : i)} aria-expanded={open === i}>
              <div className="evh"><span className="kindtag">{e.kind}</span> <b>{describe(e)}</b> <time>{new Date(e.ts).toLocaleTimeString()}</time></div>
              {e.error && <div className="everr">{e.error}</div>}
            </button>
            {open === i && <pre><span className="stepname">{e.step}</span>{"\n"}{JSON.stringify({ args: e.args, result: e.result }, null, 2)}</pre>}
          </li>
        ))}
        {!active && <li className="muted">Sign a mandate to start.</li>}
        {active && shown.length === 0 && <li className="muted">Nothing yet.</li>}
      </ol>
    </aside>
  );
}

/** "Why nothing?": what the agent found, which guardrail stopped each product, and the change the person could make. */
function NearMisses({ items, onFix }: { items: NearMiss[]; onFix: (n: NearMiss) => void }) {
  return (
    <div className="near" role="region" aria-label="Found but outside your mandate">
      <h3>Found, but outside your mandate</h3>
      <p className="muted small">The agent cannot widen the mandate. You can, and it is signed again.</p>
      <ul>
        {items.map((n) => (
          <li key={n.productId}>
            <Thumb src={n.imageUrl} title={n.title} />
            <div className="ltext">
              <b>{n.title}</b>
              <span className="muted small">{n.merchant} · {n.category} · {money(n.priceCents, n.currency)}</span>
              <ul className="whyblocked">{n.failed.map((f) => <li key={f.name}><Icon name="cross" size={14} /> <span><b>{CHECK_LABEL[f.name]}:</b> {f.reason}</span></li>)}</ul>
              {n.fix && <button className="ghost small fix" onClick={() => onFix(n)}>{n.fix.label}, then search again</button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

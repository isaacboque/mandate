import { useMemo, useState } from "react";
import { api, money, type Config, type Mandate, type PendingDraft } from "./api";
import { formFromMandate, hintsOf, mandateFromForm, problemsOf, type FormState } from "./draftForm";
import { Icon } from "./icons";
import { MoneyInput, symbol } from "./shared";
import { TagInput, humanize, normalizeCategory, normalizeShop } from "./TagInput";
import type { RunFn } from "./useRun";

const HOURS = [{ label: "1 hour", h: 1 }, { label: "4 hours", h: 4 }, { label: "24 hours", h: 24 }, { label: "3 days", h: 72 }, { label: "7 days", h: 168 }];

/** The contract in one plain sentence, for people who do not read JSON. */
export function describeMandate(m: Mandate): string {
  const cur = m.currency;
  const where = m.allowedMerchants?.length ? `only from ${m.allowedMerchants.join(", ")}` : "from any shop";
  const alone = m.autonomy.mode === "ask_always" ? "It asks you before every purchase." : `It may buy alone when the cart is under ${money(m.autonomy.thresholdCents, cur)}; anything above waits for you.`;
  return `Up to ${money(m.totalBudgetCents, cur)} in total, ${money(m.perItemCapCents, cur)} per item, at most ${m.maxQuantityPerItem} of each. Only ${m.allowedCategories.join(", ")}, ${where}. ${alone}`;
}

/**
 * A pending draft as an editable form. Fields the agent filled say so; Sign sends the fields exactly as they are here.
 * Nothing is signed until the person presses the button, and the agent has no way to press it.
 */
export function DraftForm({ draft, config, busy, run, onDone, onSigned, onDiscard }: { draft: PendingDraft; config: Config; busy: boolean; run: RunFn; onDone: () => void; onSigned?: (draft: PendingDraft) => void; onDiscard?: (draft: PendingDraft) => void }) {
  const live = config.demoMode === "live";
  const sym = symbol(draft.mandate.currency);
  const [f, setF] = useState<FormState>(() => formFromMandate(draft.mandate));
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const m = useMemo(() => mandateFromForm(f, draft.mandate), [f, draft.mandate]);
  const problems = problemsOf(m, f.auto);
  const fromAgent = draft.source === "agent" ? <span className="fromagent">from the agent</span> : null;
  const shoeCats = live ? ["athletic-shoes", "soccer-shoes", "sneakers"] : ["shoes"];
  const knownCats = live ? ["athletic-shoes", "soccer-shoes", "sneakers", "in-ear-headphones"] : ["shoes", "socks", "balls", "bags", "clothing", "protection"];
  const seenCats = config.seen?.categories ?? [];
  const catSuggestions = [...seenCats.map((c) => ({ value: c.value, note: `${c.count} found` })), ...knownCats.filter((k) => !seenCats.some((c) => c.value === k)).map((k) => ({ value: k }))];
  const searchCategories = async (q: string) =>
    (await api.categories(q)).categories.map((c) => ({
      value: c.slug, label: c.title,
      note: [c.path.length > 1 ? c.path.slice(0, -1).map((n) => n.title).join(" › ") : "", c.hasChildren ? "includes subcategories" : ""].filter(Boolean).join(" · "),
    }));
  const shopSuggestions = (config.seen?.merchants ?? []).map((s) => ({ value: s.value, note: `${s.count} found` }));
  const id = draft.id;
  const sign = () => run(() => api.signDraft(draft.id, m)).then((r) => { if (r) { onDone(); onSigned?.(draft); } });
  // With an undo toast behind it (onDiscard) there is no confirm step: the draft goes at once and can be brought back for a few seconds.
  const discard = () => (onDiscard ? onDiscard(draft) : run(() => api.discardDraft(draft.id)).then((r) => r && onDone()));

  return (
    <article className="card draftform" aria-label="Contract draft to review">
      <div className="draftcap"><span className="statuschip draft">Draft: not signed</span>{fromAgent}</div>
      <h3>Review this contract</h3>
      {draft.understood.length > 0 && (
        <ul className="understood-list">{draft.understood.map((u) => <li key={u}><Icon name="check" size={14} /> {u}</li>)}</ul>
      )}
      {draft.warnings.map((w) => <p key={w} className="hintline" role="note">{w}</p>)}

      <div className="mform" onKeyDown={(e) => { if (e.key === "Enter" && !e.defaultPrevented && !e.nativeEvent.isComposing && e.target instanceof HTMLInputElement && e.target.type === "text" && !busy && problems.length === 0) { e.preventDefault(); sign(); } }}>
        <fieldset className="fgroup">
          <legend>Spending limits</legend>
          <label>Total budget {fromAgent}<MoneyInput sym={sym} value={f.budget} onChange={(v) => set("budget", v)} label="Total budget" /></label>
          <label>Max per item {fromAgent}<MoneyInput sym={sym} value={f.cap} onChange={(v) => set("cap", v)} label="Max per item" /></label>
          <label>Max quantity per item {fromAgent}<input inputMode="numeric" value={f.qty} onChange={(e) => set("qty", e.target.value)} /></label>
          <label>Valid for {fromAgent}
            <select value={String(f.expiry)} onChange={(e) => set("expiry", e.target.value === "keep" ? "keep" : Number(e.target.value))}>
              <option value="keep">Until {new Date(draft.mandate.expiresAt).toLocaleString()}</option>
              {HOURS.map((o) => <option key={o.h} value={o.h}>{o.label} from signing</option>)}
            </select>
          </label>
        </fieldset>
        <fieldset className="fgroup">
          <legend>What it may buy {fromAgent}</legend>
          <TagInput
            id={`cats-${id}`} label="Categories" hint="(what kind of thing)" values={f.cats} onChange={(v) => set("cats", v)}
            normalize={normalizeCategory} format={humanize} placeholder="Type a category and press Enter"
            suggestions={catSuggestions} suggestionsLabel={seenCats.length ? "Seen in your searches and known:" : "Known categories:"}
            search={searchCategories} groups={live ? [{ label: "All shoes", values: shoeCats }] : []}
          />
          <TagInput
            id={`shops-${id}`} label="Shops" hint="(optional: any shop if empty)" values={f.merchants} onChange={(v) => set("merchants", v)}
            normalize={normalizeShop} placeholder={live ? "e.g. shoebacca.com" : "e.g. futsalstore.example"}
            suggestions={shopSuggestions} suggestionsLabel="Seen in your searches:"
          />
        </fieldset>
        <fieldset className="fgroup autonomy">
          <legend>What may it do alone? {fromAgent}</legend>
          <label className={`opt ${!f.auto ? "on" : ""}`}><input type="radio" name={`auto-${id}`} checked={!f.auto} onChange={() => set("auto", false)} /> Nothing: ask me every time</label>
          <label className={`opt ${f.auto ? "on" : ""}`}>
            <input type="radio" name={`auto-${id}`} checked={f.auto} onChange={() => set("auto", true)} /> Buy alone when the cart is under
            <MoneyInput sym={sym} value={f.threshold} onChange={(v) => set("threshold", v)} disabled={!f.auto} inline label="Auto-buy amount" />
          </label>
        </fieldset>
      </div>
      {hintsOf(m).map((h) => <p key={h} className="hintline">{h}</p>)}
      <p className="sentence" aria-live="polite">{problems.length ? problems[0] : describeMandate(m)}</p>
      <div className="actions">
        <button className="ghost" disabled={busy} onClick={discard}>Discard</button>
        <button className="primary" disabled={busy || problems.length > 0} onClick={sign}>Sign contract</button>
      </div>
    </article>
  );
}

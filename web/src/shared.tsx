import { useEffect, useState, type KeyboardEvent } from "react";
import { formatMoneyInput, parseMoney } from "./moneyInput";

export const symbol = (currency: string) => new Intl.NumberFormat("en", { style: "currency", currency }).formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;

/** Enter sends a one-line request; Shift+Enter adds a line; Ctrl/Cmd+Enter also sends. Never while an IME is composing. */
export const sendKey = (e: KeyboardEvent) => e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing;


/** A money field that takes "90", "90€", "€90", "90 eur" or "90,00" and shows back one clean value on leaving the field. */
export function MoneyInput({ sym, value, onChange, disabled, inline, label }: { sym: string; value: string; onChange: (v: string) => void; disabled?: boolean; inline?: boolean; label?: string }) {
  const cents = parseMoney(value);
  const invalid = value.trim() !== "" && Number.isNaN(cents);
  return (
    <span className={`cur ${inline ? "inline" : ""}`}>
      <i>{sym}</i>
      <input
        inputMode="decimal" autoComplete="off" aria-label={label} aria-invalid={invalid || undefined} value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => { const clean = formatMoneyInput(cents); if (clean && clean !== value) onChange(clean); }}
      />
    </span>
  );
}

export function Thumb({ src, title }: { src?: string; title: string }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) return <img className="thumb" src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
  return <span className="thumb ph" aria-hidden>{title.trim().charAt(0).toUpperCase() || "?"}</span>;
}

/** Only real http(s) links; the demo catalog's ".example" shops do not exist, so they are not linked. */
export const safeHref = (u: string) => (/^https?:\/\/(?![^/]*\.example(?:[:/]|$))/i.test(u) ? u : undefined);


/** Honest waiting state: we do not fake progress, we say what is going on and how long it can take. */
export function Working({ live, model, status }: { live: boolean; model?: string; status?: string }) {
  const [s, setS] = useState(0);
  useEffect(() => { const t = setInterval(() => setS((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  return (
    <div className="working" role="status">
      <span className="spinner" aria-hidden />
      <div>
        <b>{model ? `Thinking with ${model}… ${s}s` : `The agent is searching and choosing… ${s}s`}</b>
        <p className="muted small">{status ?? (model || live ? "A model turn can take 5 to 20 seconds. Every step shows in the trace." : "This should take a moment.")}</p>
      </div>
    </div>
  );
}

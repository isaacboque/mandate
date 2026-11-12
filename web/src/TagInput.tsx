import { useRef, useState } from "react";
import { Icon } from "./icons";

/** "athletic-shoes" -> "Athletic shoes". The stored value stays the catalog's own slug. */
export const humanize = (slug: string) => slug.replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Lower case, spaces and underscores to dashes, nothing else: "Athletic Shoes" -> "athletic-shoes". */
export const normalizeCategory = (raw: string) => raw.trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");

/** A shop as the catalog names it: "https://www.Shoebacca.com/x" -> "shoebacca.com". */
export const normalizeShop = (raw: string) => raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "").replace(/[^a-z0-9.-]/g, "");

type Suggestion = { value: string; note?: string };
type Group = { label: string; values: string[] };

/**
 * Chips instead of a comma-separated text box: type and press Enter or comma to add, click x to remove,
 * Backspace removes the last one. Suggestions (what the catalog returned, plus known groups) add in one click.
 */
export function TagInput({ id, label, hint, values, onChange, normalize, format = (v) => v, placeholder, suggestions = [], groups = [], suggestionsLabel }: {
  id: string; label: string; hint?: string; values: string[]; onChange: (v: string[]) => void; normalize: (raw: string) => string;
  format?: (v: string) => string; placeholder?: string; suggestions?: Suggestion[]; groups?: Group[]; suggestionsLabel?: string;
}) {
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const add = (raw: string) => {
    const parts = raw.split(/[,\n]/).map(normalize).filter(Boolean);
    if (parts.length === 0) { setText(""); return; }
    const next = [...values];
    for (const p of parts) if (!next.includes(p)) next.push(p);
    onChange(next);
    setText("");
  };
  const remove = (v: string) => onChange(values.filter((x) => x !== v));

  const open = suggestions.filter((s) => !values.includes(s.value));
  const openGroups = groups.filter((g) => g.values.some((v) => !values.includes(v)));

  return (
    <div className="tagfield">
      <label htmlFor={id}>{label}{hint && <span className="muted"> {hint}</span>}</label>
      <div className="tagbox" onClick={() => input.current?.focus()}>
        {values.map((v) => (
          <span className="tag" key={v}>
            <span title={v}>{format(v)}</span>
            <button type="button" aria-label={`Remove ${format(v)}`} onClick={(e) => { e.stopPropagation(); remove(v); }}><Icon name="cross" size={12} /></button>
          </span>
        ))}
        <input
          id={id} ref={input} value={text} placeholder={values.length ? "" : placeholder}
          onChange={(e) => (/[,\n]/.test(e.target.value) ? add(e.target.value) : setText(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(text); }
            else if (e.key === "Backspace" && text === "" && values.length) remove(values[values.length - 1]);
          }}
          onBlur={() => text && add(text)}
        />
      </div>
      {(open.length > 0 || openGroups.length > 0) && (
        <div className="sugg" role="group" aria-label={suggestionsLabel ?? "Suggestions"}>
          {suggestionsLabel && <span className="muted small">{suggestionsLabel}</span>}
          {openGroups.map((g) => <button type="button" key={g.label} className="chip ghost" onClick={() => add(g.values.join(","))}>+ {g.label}</button>)}
          {open.map((s) => <button type="button" key={s.value} className="chip" onClick={() => add(s.value)}>+ {format(s.value)}{s.note && <i>{s.note}</i>}</button>)}
        </div>
      )}
    </div>
  );
}

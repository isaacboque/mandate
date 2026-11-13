import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

/** "athletic-shoes" -> "Athletic shoes". The stored value stays the catalog's own slug. */
export const humanize = (slug: string) => slug.replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Lower case, spaces and underscores to dashes, nothing else: "Athletic Shoes" -> "athletic-shoes". */
export const normalizeCategory = (raw: string) => raw.trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");

/** A shop as the catalog names it: "https://www.Shoebacca.com/x" -> "shoebacca.com". */
export const normalizeShop = (raw: string) => raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "").replace(/[^a-z0-9.-]/g, "");

/** Miller: at most seven suggestions at once; the rest are one click away. */
const MAX_SHOWN = 7;

export type Suggestion = { value: string; label?: string; note?: string };
type Group = { label: string; values: string[] };

/**
 * Chips instead of a comma-separated text box: type and press Enter or comma to add, click x to remove,
 * Backspace removes the last one. Suggestions (what the catalog returned, known groups, and, when `search`
 * is given, live matches from the catalog's category tree) add in one click.
 */
export function TagInput({ id, label, hint, values, onChange, normalize, format = (v) => v, placeholder, suggestions = [], groups = [], suggestionsLabel, search }: {
  id: string; label: string; hint?: string; values: string[]; onChange: (v: string[]) => void; normalize: (raw: string) => string;
  format?: (v: string) => string; placeholder?: string; suggestions?: Suggestion[]; groups?: Group[]; suggestionsLabel?: string;
  search?: (query: string) => Promise<Suggestion[]>;
}) {
  const [text, setText] = useState("");
  const [found, setFound] = useState<Suggestion[]>([]);
  const [warn, setWarn] = useState<string>();
  const [armed, setArmed] = useState("");
  const [more, setMore] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const searchRef = useRef(search);
  searchRef.current = search;

  // Ask the catalog for matches a moment after the person stops typing.
  useEffect(() => {
    const q = text.trim();
    if (!searchRef.current || q.length < 2) { setFound([]); return; }
    let alive = true;
    const t = setTimeout(() => { searchRef.current?.(q).then((r) => alive && setFound(r)).catch(() => alive && setFound([])); }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [text]);

  const add = (raw: string) => {
    const parts = raw.split(/[,\n]/).map(normalize).filter(Boolean);
    setWarn(undefined);
    if (parts.length === 0) { setText(""); return; }
    const next = [...values];
    for (const p of parts) if (!next.includes(p)) next.push(p);
    onChange(next);
    setText("");
  };
  /** Enter on a typed word: if the catalog knows similar categories but not this exact one, do not add a name that matches nothing. */
  const submit = () => {
    const typed = normalize(text);
    if (!typed) return;
    if (found.length > 0 && !found.some((f) => f.value === typed)) {
      if (found.length === 1) add(found[0].value);
      else setWarn(`"${text.trim()}" is not a category name in the catalog. Pick one of the matches below.`);
      return;
    }
    // The catalog knows nothing like it (or could not be asked): say so, and add it only on a second Enter.
    if (search && found.length === 0 && armed !== typed) {
      setWarn(`No category called "${text.trim()}" was found in the catalog. Press Enter again to add it anyway.`);
      setArmed(typed);
      return;
    }
    add(text);
  };
  const remove = (v: string) => onChange(values.filter((x) => x !== v));

  const typed = text.trim().toLowerCase();
  const fresh = (s: Suggestion) => !values.includes(s.value);
  // Matches from the catalog first, then what we already know, narrowed by what is being typed.
  const open = [
    ...found.filter(fresh),
    ...suggestions.filter(fresh).filter((s) => !found.some((f) => f.value === s.value) && (!typed || s.value.includes(typed.replace(/\s+/g, "-")) || (s.label ?? "").toLowerCase().includes(typed))),
  ];
  const openGroups = groups.filter((g) => g.values.some((v) => !values.includes(v)));
  const heading = found.length > 0 ? "Matches in the catalog:" : suggestionsLabel;

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
          id={id} ref={input} value={text} placeholder={values.length ? "" : placeholder} autoComplete="off"
          onChange={(e) => { setWarn(undefined); setArmed(""); if (/[,\n]/.test(e.target.value)) add(e.target.value); else setText(e.target.value); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); submit(); }
            else if (e.key === "Escape" && (text || warn)) { e.preventDefault(); e.stopPropagation(); setText(""); setWarn(undefined); setArmed(""); }
            else if (e.key === "Backspace" && text === "" && values.length) remove(values[values.length - 1]);
          }}
          onBlur={() => { if (text && !search) add(text); }}
        />
      </div>
      {warn && <p className="tagwarn" role="status">{warn}</p>}
      {(open.length > 0 || openGroups.length > 0) && (
        <div className="sugg" role="group" aria-label={heading ?? "Suggestions"}>
          {heading && <span className="muted small">{heading}</span>}
          {!typed && openGroups.map((g) => <button type="button" key={g.label} className="chip ghost" onClick={() => add(g.values.join(","))}>+ {g.label}</button>)}
          {(more ? open : open.slice(0, MAX_SHOWN)).map((s) => <button type="button" key={s.value} className="chip" title={s.value} onClick={() => add(s.value)}>+ {s.label ?? format(s.value)}{s.note && <i>{s.note}</i>}</button>)}
          {open.length > MAX_SHOWN && <button type="button" className="chip morebtn" onClick={() => setMore((m) => !m)}>{more ? "Show fewer" : `Show ${open.length - MAX_SHOWN} more`}</button>}
        </div>
      )}
    </div>
  );
}

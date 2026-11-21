import { useState } from "react";
import { nextStep, STEPS, stepHint, type StepsDone } from "./stepper";

const KEY = "mandate-tour-hidden";
const read = () => { try { return window.sessionStorage.getItem(KEY) === "1"; } catch { return false; } };
const write = () => { try { window.sessionStorage.setItem(KEY, "1"); } catch { /* private window: it just comes back on reload */ } };

/**
 * "Try it in 60 s": the six steps of docs/DEMO.md. Each ticks from what the server shows (see stepper.ts). Dismissible for this tab,
 * gone once all six are done. On a phone it starts as a one-line strip you can open.
 */
export function Tour({ done, pendingCart = false }: { done: StepsDone; pendingCart?: boolean }) {
  const [hidden, setHidden] = useState(read);
  const [open, setOpen] = useState(() => !window.matchMedia?.("(max-width: 700px)").matches);
  const finished = STEPS.every((s) => done[s.id]);
  if (hidden || finished) return null;
  const next = nextStep(done);
  const count = STEPS.filter((s) => done[s.id]).length;
  return (
    <section className="tour" aria-label="Try it in 60 seconds">
      <div className="tour-head">
        <button type="button" className="tour-toggle" aria-expanded={open} aria-controls="tour-steps" onClick={() => setOpen((o) => !o)}>
          <b>Try it in 60 s</b> <span className="tour-count">{count} of {STEPS.length} done</span>
        </button>
        <button type="button" className="linklike" onClick={() => { write(); setHidden(true); }}>Hide</button>
      </div>
      {open && (
        <ol id="tour-steps" className="tour-steps">
          {STEPS.map((s, i) => (
            <li key={s.id} className={done[s.id] ? "done" : next === s.id ? "next" : ""} aria-current={next === s.id ? "step" : undefined}>
              <span className="tick" aria-hidden>{done[s.id] ? "✓" : i + 1}</span>
              <span><b>{s.label}</b>{done[s.id] && <span className="sr-only"> (done)</span>}{next === s.id && <small className="muted">{stepHint(s.id, pendingCart)}</small>}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

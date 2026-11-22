import { flushSync } from "react-dom";

type Doc = { startViewTransition?: (update: () => void) => unknown };

/**
 * A change on one page (switching tabs, opening the trace) as a view transition: the browser captures the page before and after and animates the
 * difference, under 300 ms (see details.css). Under reduced motion, or in a browser without the API, the change simply happens. The change is
 * applied synchronously inside the callback (flushSync) because the browser needs the new DOM at that moment.
 */
export function runTransition(update: () => void, o: { doc?: Doc; reduced?: boolean; sync?: (f: () => void) => void } = {}): void {
  const doc = o.doc ?? (typeof document === "undefined" ? {} : (document as Doc));
  const reduced = o.reduced ?? (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true);
  const sync = o.sync ?? flushSync;
  if (reduced || typeof doc.startViewTransition !== "function") { update(); return; }
  try { doc.startViewTransition(() => sync(update)); } catch { update(); }
}

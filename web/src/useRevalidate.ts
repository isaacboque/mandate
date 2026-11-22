import { useEffect, useRef } from "react";

type Doc = EventTarget & { visibilityState?: string };

/**
 * Revalidate, not stale-while-revalidate: this app shows spend, budgets and approvals, where an old value costs money, so nothing is served from a
 * cache. What it does keep is the other half: when the window regains focus (for example after approving in the PayPal tab), when the tab becomes
 * visible again or when the network comes back, the state is fetched again in the background. A burst of events refreshes once, and never while an
 * action or a chat turn is running. Returns the cleanup.
 */
export function revalidateOnFocus(o: { win: EventTarget; doc: Doc; refresh: () => void; canRun: () => boolean; minGapMs?: number; now?: () => number }): () => void {
  const gap = o.minGapMs ?? 5000, now = o.now ?? Date.now;
  let last = now();
  const go = () => {
    if (!o.canRun() || now() - last < gap) return;
    last = now();
    o.refresh();
  };
  const onVisible = () => { if (o.doc.visibilityState !== "hidden") go(); };
  o.win.addEventListener("focus", go);
  o.win.addEventListener("online", go);
  o.doc.addEventListener("visibilitychange", onVisible);
  return () => { o.win.removeEventListener("focus", go); o.win.removeEventListener("online", go); o.doc.removeEventListener("visibilitychange", onVisible); };
}

/** The hook: `idle` says whether it is safe to refresh now. */
export function useRevalidate(refresh: () => void, idle: boolean) {
  const idleRef = useRef(idle);
  idleRef.current = idle;
  useEffect(() => revalidateOnFocus({ win: window, doc: document, refresh, canRun: () => idleRef.current }), [refresh]);
}

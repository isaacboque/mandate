import { useEffect, useState } from "react";
import { WorkspaceSkeleton } from "./Skeleton";

export type BootPhase = "quiet" | "skeleton" | "waking" | "error";
/** Nothing in the first 300 ms (a normal page load must not flash a placeholder), then the skeleton, then, after 2 s, the "waking up" message above it. */
export const bootPhase = (elapsedMs: number, hasError: boolean): BootPhase => (hasError ? "error" : elapsedMs < 300 ? "quiet" : elapsedMs < 2000 ? "skeleton" : "waking");

/** The first request can wait for a sleeping free-tier server. Say so, with a clock, instead of showing nothing. */
export function Booting({ error, onRetry }: { error?: string; onRetry: () => void }) {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (error) return;
    setMs(0);
    const t0 = Date.now();
    const timers = [window.setTimeout(() => setMs(Date.now() - t0), 300), window.setInterval(() => setMs(Date.now() - t0), 1000)];
    return () => { window.clearTimeout(timers[0]); window.clearInterval(timers[1]); };
  }, [error]);
  const phase = bootPhase(ms, Boolean(error));
  if (phase === "error") {
    return (
      <section className="card boot" role="alert">
        <h2>The demo is not answering yet</h2>
        <p className="muted hint">{error}</p>
        <div className="actions tight"><button className="primary" onClick={onRetry}>Try again</button></div>
      </section>
    );
  }
  if (phase === "quiet") return <div className="boot-quiet" aria-busy="true" />;
  const s = Math.floor(ms / 1000);
  return (
    <>
      {phase === "waking" && (
        <section className="card boot" role="status">
          <div className="working"><span className="spinner" aria-hidden /><div>
            <b>Waking up the demo… {s}s</b>
            <p className="muted small">This demo runs on free hosting that sleeps when nobody uses it. The first visit can take about 30 seconds; after that it is fast.</p>
          </div></div>
        </section>
      )}
      <WorkspaceSkeleton />
    </>
  );
}

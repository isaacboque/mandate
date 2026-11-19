import { useEffect, useState } from "react";

/** The first request can wait for a sleeping free-tier server. Say so, with a clock, instead of showing nothing. */
export function Booting({ error, onRetry }: { error?: string; onRetry: () => void }) {
  const [s, setS] = useState(0);
  useEffect(() => { if (error) return; setS(0); const t = setInterval(() => setS((x) => x + 1), 1000); return () => clearInterval(t); }, [error]);
  if (error) {
    return (
      <section className="card boot" role="alert">
        <h2>The demo is not answering yet</h2>
        <p className="muted hint">{error}</p>
        <div className="actions tight"><button className="primary" onClick={onRetry}>Try again</button></div>
      </section>
    );
  }
  // Under two seconds is a normal page load: show nothing, so a fast server does not flash a message.
  if (s < 2) return <div className="boot-quiet" aria-busy="true" />;
  return (
    <section className="card boot" role="status">
      <div className="working"><span className="spinner" aria-hidden /><div>
        <b>Waking up the demo… {s}s</b>
        <p className="muted small">This demo runs on free hosting that sleeps when nobody uses it. The first visit can take about 30 seconds; after that it is fast.</p>
      </div></div>
    </section>
  );
}

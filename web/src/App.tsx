import { useEffect, useState } from "react";

type Config = { demoMode: "mock" | "live"; currency: string };

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then(setConfig).catch(() => setConfig(null));
  }, []);
  return (
    <main>
      <header className="top">
        <div className="brand">
          <span className="logo">M</span>
          <div>
            <h1>Mandate</h1>
            <p>Agents shouldn't be trusted with money. They should be trusted with a mandate.</p>
          </div>
        </div>
        {config && <span className={`badge ${config.demoMode === "live" ? "live" : ""}`}>{config.demoMode === "live" ? "PayPal sandbox" : "Demo payments"}</span>}
      </header>
    </main>
  );
}

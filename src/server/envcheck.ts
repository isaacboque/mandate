import { KEY_VAR, resolveLlm, type Provider } from "../llm/model.js";

/**
 * `npm run doctor`: reads the environment the way the server will, and says whether it is ready and what will answer. It prints
 * whether a secret is SET, never its value. Pure (takes the environment, returns lines), so it is the same check in tests and on a host.
 */
export function checkEnv(env: NodeJS.ProcessEnv = process.env): { ok: boolean; lines: string[] } {
  const lines: string[] = [];
  const problems: string[] = [];
  const set = (k: string) => Boolean((env[k] ?? "").trim());

  const live = env.DEMO_MODE === "live";
  lines.push(`Mode: ${live ? "live (Channel3 catalog + PayPal sandbox)" : "demo mode (fixture catalog, simulated payments; no keys needed)"}`);
  if (live) {
    for (const k of ["CHANNEL3_API_KEY", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"]) {
      lines.push(`  ${k}: ${set(k) ? "set" : "MISSING"}`);
      if (!set(k)) problems.push(`${k} is required in live mode`);
    }
  }

  const llm = resolveLlm(env);
  if (llm.status === "ready") lines.push(`Agent: ${llm.provider} / ${llm.model} (key from ${llm.keyVar})${llm.note ? `. ${llm.note}` : ""}`);
  else if (llm.status === "none") lines.push("Agent: offline agent (rules). No model key is set; set one of the variables below to use a model.");
  else { lines.push(`Agent: offline agent (rules). Model NOT configured: ${llm.reason}`); problems.push(llm.reason); }
  for (const p of Object.keys(KEY_VAR) as Provider[]) lines.push(`  ${KEY_VAR[p]}: ${set(KEY_VAR[p]) ? "set" : "not set"}`);

  for (const [k, min] of [["LLM_DAILY_TURN_BUDGET", 0], ["LLM_TIMEOUT_SECONDS", 1]] as const) {
    if (!set(k)) continue;
    const n = Number(env[k]);
    if (!Number.isFinite(n) || n < min) problems.push(`${k} must be a number of at least ${min} (got "${env[k]}")`);
  }

  for (const p of problems) lines.push(`PROBLEM: ${p}`);
  lines.push(problems.length ? `Not ready: ${problems.length} problem${problems.length === 1 ? "" : "s"}.` : "Ready.");
  return { ok: problems.length === 0, lines };
}

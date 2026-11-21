import { mkdirSync, writeFileSync } from "node:fs";
import { modelFor } from "../src/llm/model.js";
import { buildMonitorDataset } from "../src/eval/monitors/dataset.js";
import { promptGuardMonitor, regexMonitor, safeguardMonitor, type Monitor } from "../src/eval/monitors/monitors.js";
import { JsonlStore, monitorsToMarkdown, planMonitorRun, runMonitor } from "../src/eval/monitors/runner.js";

// Model monitor vs code monitor on the same prompt-injection dataset.
//   npm run eval:monitors -- --monitors regex                       offline, no key: reproduces the deployed detector (19/78 on the variants)
//   GROQ_API_KEY=... npm run eval:monitors -- --monitors regex,prompt-guard,safeguard [--k 3] [--resume] [--threshold 0.5] [--delay-ms 2000]
// Output: eval/MONITORS.md and traces/monitors.jsonl (one line per call; --resume skips what is already there).
// Exit codes: 0 ok · 2 no key for a model monitor · 5 bad arguments.
const argv = process.argv.slice(2);
const flag = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const names = (flag("--monitors") ?? "regex").split(",").map((s) => s.trim()).filter(Boolean);
const known = ["regex", "prompt-guard", "safeguard"];
const bad = names.filter((n) => !known.includes(n));
if (bad.length || !names.length) { console.error(`Unknown monitor(s): ${bad.join(", ") || "(none)"}. Use ${known.join(", ")}.`); process.exit(5); }
const k = Math.min(10, Math.max(1, Number(flag("--k")) || 1));
const threshold = Number(flag("--threshold") ?? 0.5);
if (!(threshold >= 0 && threshold <= 1)) { console.error("--threshold must be in [0, 1]"); process.exit(5); }
const delayMs = Math.max(0, Number(flag("--delay-ms")) || 0);
const resume = argv.includes("--resume");
const PG = process.env.PROMPT_GUARD_MODEL ?? "meta-llama/llama-prompt-guard-2-86m";
const SG = process.env.SAFEGUARD_MODEL ?? "openai/gpt-oss-safeguard-20b";

const items = buildMonitorDataset(1);
const needsKey = names.some((n) => n !== "regex");
const plan = planMonitorRun({ monitors: names, items: items.length, k });
console.error(`Plan: ${names.length} monitor(s) x ${items.length} items x ${k} repeat(s) = ${plan.calls} calls (regex makes none; model calls use the Groq free tier).`);
if (needsKey && !process.env.GROQ_API_KEY) { console.error("GROQ_API_KEY is not set: nothing was called. Run with --monitors regex for the offline baseline."); process.exit(2); }

const build = (n: string): Monitor => n === "regex" ? regexMonitor()
  : n === "prompt-guard" ? promptGuardMonitor({ name: "prompt-guard", model: modelFor("groq", PG), threshold })
  : safeguardMonitor({ name: "safeguard", model: modelFor("groq", SG) });

const store = new JsonlStore("traces/monitors.jsonl");
const entries: { name: string; results: Awaited<ReturnType<typeof runMonitor>> }[] = [];
for (const n of names) {
  const m = build(n);
  const results = await runMonitor({ monitor: m, items, k: n === "regex" ? 1 : k, store, resume, delayMs: n === "regex" ? 0 : delayMs, onProgress: (d, t) => { if (d % 20 === 0 || d === t) console.error(`${n}: ${d}/${t}`); } });
  entries.push({ name: n, results });
}
const md = monitorsToMarkdown(entries, { k, thresholds: names.includes("prompt-guard") ? { "prompt-guard": threshold } : {} });
mkdirSync("eval", { recursive: true });
writeFileSync("eval/MONITORS.md", md);
console.log(md);

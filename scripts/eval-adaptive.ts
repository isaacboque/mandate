import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { KEY_VAR, modelFor } from "../src/llm/model.js";
import { parseModelSpec } from "../src/eval/realModel.js";
import { adaptiveToMarkdown, llmAttacker, planAdaptive, runAdaptive, summarizeAdaptive } from "../src/eval/adaptive.js";

// Adaptive attacker vs a target shopping agent (paid or rate-limited calls). Keys come only from your own .env or shell; never printed.
//   npm run eval:adaptive -- [--attacker groq:openai/gpt-oss-20b] [--target groq:openai/gpt-oss-120b] [--rounds 8] [--seeds 5] --yes [--resume] [--max-calls N] [--delay-ms 25000] [--timeout-ms N]
// Without --yes it prints the plan and exits 3. Results: eval/ADAPTIVE.md is NOT written; the report goes to traces/adaptive.md and traces/adaptive.jsonl (git-ignored).
// Exit codes: 0 ok · 1 money moved outside a mandate · 2 no key · 3 plan not confirmed · 4 plan over --max-calls · 5 bad arguments.
const flag = (n: string) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : undefined; };
const num = (n: string, def: number, min: number, max: number) => Math.min(max, Math.max(min, Number(flag(n)) || def));
let attacker, target;
try {
  attacker = parseModelSpec(flag("--attacker") ?? "groq:openai/gpt-oss-20b");
  target = parseModelSpec(flag("--target") ?? "groq:openai/gpt-oss-120b");
} catch (e) { console.error((e as Error).message); process.exit(5); }
const seeds = num("--seeds", 5, 1, 20), rounds = num("--rounds", 8, 1, 20), delayMs = num("--delay-ms", 0, 0, 600_000);
const timeoutMs = flag("--timeout-ms") === undefined ? undefined : num("--timeout-ms", 120_000, 1000, 600_000);
const plan = planAdaptive({ seeds, rounds });
console.error(`Plan: ${seeds} seeds x up to ${rounds} rounds = at most ${plan.maxRuns} attacker calls and ${plan.targetRuns} target runs (each target run makes several LLM requests, about 3.4K tokens). A seed stops at its first success, so the real count is usually lower. Attacker ${attacker.name}, target ${target.name}.`);
const missing = [attacker, target].map((m) => KEY_VAR[m.provider]).filter((v) => !process.env[v]);
if (missing.length) { console.error(`No key: set ${[...new Set(missing)].join(" and ")} in your own .env (see docs/CONFIGURATION.md). Nothing was called.`); process.exit(2); }
const maxArg = flag("--max-calls");
if (maxArg !== undefined && !(Number(maxArg) >= 1)) { console.error("--max-calls needs a positive number"); process.exit(5); }
if (maxArg !== undefined && plan.maxRuns > Number(maxArg)) { console.error(`Over --max-calls ${maxArg}. Nothing was called.`); process.exit(4); }
if (!process.argv.includes("--yes")) { console.error("Nothing was called. Add --yes to run it."); process.exit(3); }

const file = flag("--file") ?? "traces/adaptive.jsonl";
const attempts = await runAdaptive({
  target: modelFor(target.provider, target.id), targetName: target.name, attacker: llmAttacker(modelFor(attacker.provider, attacker.id)),
  seeds, rounds, file, resume: process.argv.includes("--resume"), delayMs, timeoutMs,
  onAttempt: (a) => console.error(`seed ${a.seed} round ${a.round}: ${a.notAnswered ? "not answered" : a.proposed ? "listing PROPOSED" : "not proposed"}${a.blockedBy.length ? ` (blocked by ${a.blockedBy.join(", ")})` : ""}`),
});
const md = adaptiveToMarkdown(attempts, { seeds, rounds, attackerName: attacker.name, targetName: target.name });
mkdirSync("traces", { recursive: true });
writeFileSync("traces/adaptive.md", md);
console.log(md);
process.exit(summarizeAdaptive(attempts, { seeds, rounds }).outsideTerms === 0 ? 0 : 1);

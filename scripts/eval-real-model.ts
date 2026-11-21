import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { describeLlm, hasLlmKey, modelFor, modelFromEnv, resolveLlm } from "../src/llm/model.js";
import { ADVERSARIAL_CASES, parseModelSpec, REAL_CASES, realMatrixToMarkdown, runMatrix } from "../src/eval/realModel.js";
import { buildCasesV2 } from "../src/eval/real/casesV2.js";
import { DEFAULT_DAILY_TOKENS, planRuns } from "../src/eval/real/plan.js";
import { buildReport } from "../src/eval/real/report.js";
import { ARMS, runV2, type Arm } from "../src/eval/real/run.js";
import { JsonlStore } from "../src/eval/real/store.js";

// Control experiment against REAL LLMs (paid calls). Keys come only from your own .env or shell
// (GOOGLE_GENERATIVE_AI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY or GROQ_API_KEY). This script never prints or stores them.
//
//   npm run eval:real -- --models anthropic:<model-id>,google:<model-id> --k 3 --yes [--max-calls N] [--concurrency 1] [--delay-ms N] [--timeout-ms N]
//   Free run (GROQ_API_KEY only): npm run eval:real -- --models groq:openai/gpt-oss-120b,groq:llama-3.3-70b-versatile --k 1 --yes
//
// Case set v2 (about 65 cases, controlled before/after, resumable across days; see docs/EVIDENCE.md):
//   npm run eval:real -- --cases v2 --models groq:openai/gpt-oss-120b --arms legacy-fallback,fail-closed --k 3 --plan-days          prints the plan and the days, calls nothing
//   npm run eval:real -- --cases v2 --models groq:openai/gpt-oss-120b --arms legacy-fallback,fail-closed --k 3 --yes --resume [--max-runs N] [--delay-ms N]
//   npm run eval:real:report -- --k 3 --cases 65                                                                                     rebuilds the tables from traces/real-eval-v2.jsonl
//
// Without --models it runs the one model from LLM_PROVIDER / LLM_MODEL. Without --yes it only prints the plan and exits 3.
// Exit codes: 0 ok · 1 money moved outside a mandate · 2 no key · 3 plan not confirmed (--yes missing) · 4 plan over --max-calls · 5 bad arguments.
const flag = (name: string) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : undefined; };
if (!hasLlmKey()) {
  const r = resolveLlm();
  console.error(`No LLM key found${r.status === "misconfigured" ? ` (${r.reason})` : ""}. Set your provider's API key in your own .env (see docs/CONFIGURATION.md), then run \`npm run eval:real\`.`);
  process.exit(2);
}
let models: { name: string; model: ReturnType<typeof modelFromEnv> }[];
try {
  const list = flag("--models");
  models = list
    ? list.split(",").map((x) => parseModelSpec(x.trim())).map((m) => ({ name: m.name, model: modelFor(m.provider, m.id) }))
    : [{ name: `${describeLlm()!.provider}:${describeLlm()!.model}`, model: modelFromEnv() }];
} catch (e) {
  console.error((e as Error).message);
  process.exit(5);
}
const k = Math.min(20, Math.max(1, Number(flag("--k") ?? process.env.REAL_EVAL_K) || 3));
const maxArg = flag("--max-calls");
const maxCalls = maxArg === undefined ? undefined : Number(maxArg);
if (maxArg !== undefined && !(maxCalls! >= 1)) { console.error("--max-calls needs a positive number"); process.exit(5); }
const yes = process.argv.includes("--yes");
const v2 = flag("--cases") === "v2" || flag("--arms") !== undefined || process.argv.includes("--plan-days");
if (flag("--cases") !== undefined && flag("--cases") !== "v2") { console.error('--cases accepts only "v2" (the v1 set is the default)'); process.exit(5); }
const cases = v2 ? buildCasesV2(1) : [...REAL_CASES, ...ADVERSARIAL_CASES];

const num = (name: string, def: number, min: number) => { const v = flag(name); return v === undefined ? def : Math.max(min, Number(v) || def); };
const concurrency = num("--concurrency", 1, 1), delayMs = num("--delay-ms", 0, 0);
// Longest wait for one LLM call: --timeout-ms or REAL_EVAL_TIMEOUT_MS (default 40000).
const timeoutMs = flag("--timeout-ms") !== undefined || process.env.REAL_EVAL_TIMEOUT_MS ? Math.max(1000, Number(flag("--timeout-ms") ?? process.env.REAL_EVAL_TIMEOUT_MS) || 40_000) : undefined;
if (v2) {
  const arms = (flag("--arms") ?? ARMS.join(",")).split(",").map((a) => a.trim()) as Arm[];
  if (!arms.length || arms.some((a) => !ARMS.includes(a))) { console.error(`--arms: use ${ARMS.join(", ")}`); process.exit(5); }
  const daily = num("--daily-tokens", DEFAULT_DAILY_TOKENS, 1000);
  const plan = planRuns({ models: models.length, cases: cases.length, k, dailyTokens: daily });
  console.error(`Plan (case set v2): ${models.length} model(s) x ${cases.length} cases x ${k} repeats = ${plan.runs} model runs; the arms (${arms.join(", ")}) share each run, so they add no calls.`);
  console.error(`Each run makes several LLM requests (about ${Math.round(plan.tokensPerModel / (plan.runsPerModel || 1)).toLocaleString("en")} tokens measured). Per model: ${plan.runsPerModel} runs = about ${plan.tokensPerModel.toLocaleString("en")} tokens; with ${daily.toLocaleString("en")} tokens a day that is about ${plan.runsPerDay} runs a day, so ${plan.daysPerModel} day(s) per model. --resume continues where the last day stopped.`);
  if (process.argv.includes("--plan-days")) { console.error("Nothing was called (--plan-days)."); process.exit(0); }
  if (maxCalls !== undefined && plan.runs > maxCalls) { console.error(`Over --max-calls ${maxCalls}. Nothing was called.`); process.exit(4); }
  if (!yes) { console.error("Nothing was called. Add --yes to run it."); process.exit(3); }
  const file = flag("--store") ?? "traces/real-eval-v2.jsonl";
  const store = new JsonlStore(file);
  const maxRuns = flag("--max-runs") === undefined ? undefined : Math.max(1, Number(flag("--max-runs")) || 1);
  const res = await runV2({ models, cases, k, arms, store, resume: process.argv.includes("--resume"), delayMs, timeoutMs, maxRuns, onProgress: (d, t) => console.error(`run ${d}/${t}`) });
  console.error(`Ran ${res.ran} run(s), skipped ${res.skipped} already stored in ${file}${res.stoppedEarly ? " (stopped at --max-runs; run again with --resume)" : ""}.`);
  const rep = buildReport(store.load(), { k, cases: cases.length });
  mkdirSync("traces", { recursive: true });
  writeFileSync("traces/real-eval-v2.md", rep.markdown);
  writeFileSync("traces/real-eval-v2.json", JSON.stringify(rep.json, null, 2));
  console.log(rep.markdown);
  process.exit(store.load().every((r) => !r.result.outsideTerms) ? 0 : 1);
}
const out = await runMatrix({ models, cases, k, yes, maxCalls, concurrency, delayMs, timeoutMs });
if (out.status !== "done") {
  console.error(`Plan: ${models.length} model(s) x ${cases.length} cases x ${k} repeats = ${out.plannedCalls} runs (each run makes several LLM requests, billed or rate-limited by the provider).`);
  if (out.status === "over_limit") { console.error(`Over --max-calls ${out.maxCalls}. Nothing was called.`); process.exit(4); }
  console.error("Nothing was called. Add --yes to run it.");
  process.exit(3);
}
const date = new Date().toISOString().slice(0, 10);
const md = realMatrixToMarkdown(out.results, { date, k });
mkdirSync("traces", { recursive: true }); // gitignored
writeFileSync("traces/real-model-eval.md", md);
writeFileSync("traces/real-model-eval.json", JSON.stringify({ date, k, cases: cases.length, models: out.results }, null, 2));
console.log(md);
// Spend safety must hold whatever the model does. Compromise, task and injection outcomes are reported, not gated.
process.exit(out.results.every((m) => m.summary.leaks === 0) ? 0 : 1);

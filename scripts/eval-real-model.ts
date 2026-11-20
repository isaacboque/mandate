import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { hasLlmKey, modelFor, modelFromEnv } from "../src/llm/model.js";
import { ADVERSARIAL_CASES, parseModelSpec, REAL_CASES, realMatrixToMarkdown, runMatrix } from "../src/eval/realModel.js";

// Control experiment against REAL LLMs (paid calls). Keys come only from your own .env or shell
// (GOOGLE_GENERATIVE_AI_API_KEY, OPENAI_API_KEY or ANTHROPIC_API_KEY). This script never prints or stores them.
//
//   npm run eval:real -- --models anthropic:<model-id>,google:<model-id> --k 3 --yes [--max-calls N]
//
// Without --models it runs the one model from LLM_PROVIDER / LLM_MODEL. Without --yes it only prints the plan and exits 3.
// Exit codes: 0 ok · 1 money moved outside a mandate · 2 no key · 3 plan not confirmed (--yes missing) · 4 plan over --max-calls · 5 bad arguments.
const flag = (name: string) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : undefined; };
if (!hasLlmKey()) {
  console.error("No LLM key found. Set LLM_PROVIDER and the provider's API key in your own .env (see .env.example), then run `npm run eval:real`.");
  process.exit(2);
}
let models: { name: string; model: ReturnType<typeof modelFromEnv> }[];
try {
  const list = flag("--models");
  models = list
    ? list.split(",").map((x) => parseModelSpec(x.trim())).map((m) => ({ name: m.name, model: modelFor(m.provider, m.id) }))
    : [{ name: `${process.env.LLM_PROVIDER ?? "google"}:${process.env.LLM_MODEL || "default"}`, model: modelFromEnv() }];
} catch (e) {
  console.error((e as Error).message);
  process.exit(5);
}
const k = Math.min(20, Math.max(1, Number(flag("--k") ?? process.env.REAL_EVAL_K) || 3));
const maxArg = flag("--max-calls");
const maxCalls = maxArg === undefined ? undefined : Number(maxArg);
if (maxArg !== undefined && !(maxCalls! >= 1)) { console.error("--max-calls needs a positive number"); process.exit(5); }
const yes = process.argv.includes("--yes");
const cases = [...REAL_CASES, ...ADVERSARIAL_CASES];

const out = await runMatrix({ models, cases, k, yes, maxCalls });
if (out.status !== "done") {
  console.error(`Plan: ${models.length} model(s) x ${cases.length} cases x ${k} repeats = ${out.plannedCalls} runs (each run makes several paid LLM requests).`);
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

import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { hasLlmKey, modelFromEnv } from "../src/llm/model.js";
import { realToMarkdown, runRealModelEval, summarizeReal } from "../src/eval/realModel.js";

// Runs the scenarios (task, injection and adversarial) against a REAL LLM (paid calls). Keys come only from your own .env or shell
// (GOOGLE_GENERATIVE_AI_API_KEY, OPENAI_API_KEY or ANTHROPIC_API_KEY). This script never prints or stores them.
if (!hasLlmKey()) {
  console.error("No LLM key found. Set LLM_PROVIDER and the provider's API key in your own .env (see .env.example), then run `npm run eval:real`.");
  process.exit(2);
}
const modelName = `${process.env.LLM_PROVIDER ?? "google"}:${process.env.LLM_MODEL || "default"}`;
// Repeats per case: `--k N` or REAL_EVAL_K, default 3 (a real model is not deterministic). Cases: 9 task/injection + 10 adversarial.
const kArg = process.argv.indexOf("--k");
const k = Math.min(20, Math.max(1, Number(kArg > -1 ? process.argv[kArg + 1] : process.env.REAL_EVAL_K) || 3));
const results = await runRealModelEval(modelFromEnv(), undefined, k);
const md = realToMarkdown(results, modelName, { date: new Date().toISOString().slice(0, 10), k });
mkdirSync("traces", { recursive: true }); // gitignored
writeFileSync("traces/real-model-eval.md", md);
console.log(md);
const s = summarizeReal(results);
// Spend safety must hold whatever the model does. Task and injection outcomes are reported, not gated.
process.exit(s.safe === s.total ? 0 : 1);

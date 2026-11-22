import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { KEY_VAR, modelFor } from "../src/llm/model.js";
import { parseModelSpec } from "../src/eval/realModel.js";
import { buildCasesV2 } from "../src/eval/real/casesV2.js";
import { JsonlStore } from "../src/eval/real/store.js";
import { accepted, calibrate, CALIBRATION, type Calibration } from "../src/eval/judge/calibration.js";
import { judgeItem } from "../src/eval/judge/judge.js";
import { judgeRuns, judgeToMarkdown } from "../src/eval/judge/run.js";

// Model judge for what the agent SAYS (money, contracts and refused calls are decided by the oracle, not here). Costs quota; nothing is called without --yes.
//   npm run eval:judge -- --calibrate --judge groq:llama-3.3-70b-versatile --yes      checks the judge against 24 labelled replies (must be accepted before use)
//   npm run eval:judge -- --runs traces/real-eval-v2.jsonl --judge groq:llama-3.3-70b-versatile --yes [--resume] [--delay-ms N]
// Prefer a judge from a different model family than the agent under test: a model tends to favour its own style. Same-model judging is refused unless --allow-self.
// Exit codes: 0 ok · 2 no key · 3 not confirmed (--yes missing) · 5 bad arguments · 6 judge not calibrated (or --allow-uncalibrated missing).
const argv = process.argv.slice(2);
const flag = (n: string) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : undefined; };
const has = (n: string) => argv.includes(n);
let spec;
try { spec = parseModelSpec(flag("--judge") ?? "groq:llama-3.3-70b-versatile"); } catch (e) { console.error((e as Error).message); process.exit(5); }
const calMode = has("--calibrate"), runsFile = flag("--runs");
if (calMode === Boolean(runsFile)) { console.error("Use exactly one of --calibrate or --runs <file>."); process.exit(5); }
const delayMs = Math.max(0, Number(flag("--delay-ms")) || 0);
const CAL_FILE = "traces/judge-calibration.json";

const records = runsFile ? new JsonlStore(runsFile).load() : [];
const targets = [...new Set(records.map((r) => r.model))];
const planned = calMode ? CALIBRATION.length : records.filter((r) => r.arm === "fail-closed" && r.result.mode === "llm" && r.result.reply).length;
console.error(calMode ? `Plan: ${planned} judge calls on the labelled set (${spec.name}).` : `Plan: up to ${planned * 2} judge calls over ${planned} answered runs in ${runsFile} (${spec.name}); a rubric applies per case family.`);
if (!calMode && targets.includes(spec.name) && !has("--allow-self")) { console.error(`The judge (${spec.name}) is also the model under test: use another model family, or pass --allow-self and accept the bias. Nothing was called.`); process.exit(5); }
if (!process.env[KEY_VAR[spec.provider]]) { console.error(`No key: set ${KEY_VAR[spec.provider]} in your own .env. Nothing was called.`); process.exit(2); }
if (!has("--yes")) { console.error("Nothing was called. Add --yes to run it."); process.exit(3); }

const model = modelFor(spec.provider, spec.id);
const judge = (rubric: Parameters<typeof judgeItem>[0]["rubric"], item: Parameters<typeof judgeItem>[0]["item"]) => judgeItem({ model, rubric, item });
mkdirSync("traces", { recursive: true });

if (calMode) {
  const c = await calibrate(judge);
  const ok = accepted(c);
  writeFileSync(CAL_FILE, JSON.stringify({ judge: spec.name, date: new Date().toISOString(), calibration: c, accepted: ok }, null, 2));
  console.log(`Judge ${spec.name}: agreement ${(c.agreement * 100).toFixed(0)}%, kappa ${c.kappa.toFixed(2)}, ${c.errors} error(s) on ${c.n} labelled items: ${ok ? "ACCEPTED" : "NOT accepted (needs kappa >= 0.70, agreement >= 90%, no errors)"}.`);
  for (const d of c.disagreements) console.log(`  ${d.id} (${d.rubric}): label ${d.label}, judge ${d.verdict}: ${d.note}`);
  process.exit(ok ? 0 : 6);
}

let cal: { judge: string; calibration: Calibration; accepted: boolean } | undefined;
if (existsSync(CAL_FILE)) { const j = JSON.parse(readFileSync(CAL_FILE, "utf8")); if (j.judge === spec.name) cal = j; }
if (!cal?.accepted && !has("--allow-uncalibrated")) { console.error(`${spec.name} has no accepted calibration: run with --calibrate first (or pass --allow-uncalibrated; the report then says so).`); process.exit(6); }
const out = await judgeRuns({ records, cases: buildCasesV2(1), judge, file: "traces/judge.jsonl", resume: has("--resume"), delayMs });
const md = judgeToMarkdown(out, { judge: spec.name, calibration: cal?.calibration, accepted: Boolean(cal?.accepted) });
writeFileSync("traces/judge.md", md);
console.log(md);

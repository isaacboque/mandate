import { createInterface } from "node:readline/promises";
import { existsSync, readFileSync } from "node:fs";
import { buildCasesV2 } from "../src/eval/real/casesV2.js";
import { JsonlStore } from "../src/eval/real/store.js";
import { candidates, labelSession, loadLabels, sample, score, scoreToText } from "../src/eval/judge/label.js";
import type { JudgeRecord } from "../src/eval/judge/run.js";

// Blind labelling of real agent replies (no model call, no key). You see the request, the facts, the listing and the reply, never the judge's verdict.
//   npm run eval:judge:label -- --runs traces/real-eval-v2.jsonl --n 25 --seed 1 [--resume] [--labels eval/labels/real-replies.jsonl]
//   npm run eval:judge:label -- --score [--labels eval/labels/real-replies.jsonl] [--verdicts traces/judge.jsonl]   agreement and kappa per criterion
// Exit codes: 0 ok · 5 bad arguments.
const argv = process.argv.slice(2);
const flag = (n: string) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : undefined; };
const has = (n: string) => argv.includes(n);
const labelsFile = flag("--labels") ?? "eval/labels/real-replies.jsonl";

if (has("--score")) {
  const vFile = flag("--verdicts") ?? "traces/judge.jsonl";
  if (!existsSync(vFile)) { console.error(`No judge verdicts at ${vFile}: run npm run eval:judge first.`); process.exit(5); }
  const verdicts = new Map<string, JudgeRecord>();
  for (const line of readFileSync(vFile, "utf8").split("\n")) { if (!line.trim()) continue; try { const r = JSON.parse(line) as JudgeRecord; verdicts.set(r.key, r); } catch { /* half-written last line */ } }
  console.log(scoreToText(score(loadLabels(labelsFile), verdicts)));
  process.exit(0);
}

const runs = flag("--runs"), n = Number(flag("--n") ?? 25), seed = Number(flag("--seed") ?? 1);
if (!runs || !Number.isInteger(n) || n < 1 || !Number.isFinite(seed)) { console.error("Use --runs <file> [--n N] [--seed S] [--resume], or --score."); process.exit(5); }
if (!existsSync(runs)) { console.error(`No stored runs at ${runs}.`); process.exit(5); }
const cands = sample(candidates(new JsonlStore(runs).load(), buildCasesV2(1)), n, seed);
const rl = createInterface({ input: process.stdin, output: process.stdout });
const r = await labelSession({ cands, file: labelsFile, resume: has("--resume"), ask: (t) => rl.question(t), out: (s) => console.log(s) });
rl.close();
console.log(`Labelled ${r.labelled} now, ${r.skipped} already done${r.quit ? " (stopped)" : ""}. Labels: ${labelsFile}. Score them with: npm run eval:judge:label -- --score`);

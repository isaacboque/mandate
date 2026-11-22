import { createInterface } from "node:readline/promises";
import { existsSync } from "node:fs";
import { buildCasesV2 } from "../src/eval/real/casesV2.js";
import { JsonlStore } from "../src/eval/real/store.js";
import { rubricsOf, type RubricVersion } from "../src/eval/judge/rubrics.js";
import { labelSession, loadLabels, renderCandidate, sampleCandidates, scoreLabels } from "../src/eval/judge/label.js";
import { load } from "../src/eval/judge/run.js";

// Blind labelling of real replies (offline, no model call, no key). The judge's verdict is never shown.
//   npm run eval:judge:label -- --runs traces/real-eval-v2.jsonl --n 25 --seed 1 [--resume] [--rubrics v2]
//   npm run eval:judge:label -- --score [--judge-file traces/judge.jsonl]       joins your labels with the stored verdicts: agreement, kappa, Wilson intervals
// Labels are appended to eval/labels/real-replies.jsonl as you go. Answer p (pass), f (fail), s (skip) or q (stop; run again with --resume).
// Exit codes: 0 ok · 5 bad arguments · 7 labels already exist and --resume was not given.
const argv = process.argv.slice(2);
const flag = (n: string) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : undefined; };
const has = (n: string) => argv.includes(n);
const LABELS = flag("--labels") ?? "eval/labels/real-replies.jsonl";
const version = (flag("--rubrics") ?? "v1") as RubricVersion;
if (version !== "v1" && version !== "v2") { console.error("--rubrics must be v1 or v2."); process.exit(5); }

if (has("--score")) {
  const file = flag("--judge-file") ?? "traces/judge.jsonl";
  if (!existsSync(file)) { console.error(`No judge verdicts at ${file}.`); process.exit(5); }
  const rows = scoreLabels([...loadLabels(LABELS).values()], [...load(file).values()]);
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  for (const r of rows) console.log(`${r.rubric}: ${r.agree}/${r.n} agree (${pct(r.agreement)}, 95% CI ${pct(r.ci.low)}-${pct(r.ci.high)}), kappa ${r.kappa.toFixed(2)}, ${r.errors} judge error(s) left out`);
  if (!rows.length) console.log("No labels joined with a verdict yet.");
  process.exit(0);
}

const runs = flag("--runs"), n = Number(flag("--n") ?? 25), seed = Number(flag("--seed") ?? 1);
if (!runs || !Number.isInteger(n) || n < 1 || !Number.isInteger(seed)) { console.error("Usage: --runs <jsonl> [--n 25] [--seed 1] [--resume], or --score."); process.exit(5); }
if (loadLabels(LABELS).size && !has("--resume")) { console.error(`${LABELS} already has labels: add --resume to continue, or choose another file with --labels.`); process.exit(7); }

const candidates = sampleCandidates({ records: new JsonlStore(runs).load(), cases: buildCasesV2(1), n, seed, version });
const rubric = new Map(rubricsOf(version).map((r) => [r.id, r]));
const rl = createInterface({ input: process.stdin, output: process.stdout });
const lines = rl[Symbol.asyncIterator]();
let i = 0;
const res = await labelSession({
  candidates, file: LABELS,
  show: (c) => `\n--- ${++i}/${candidates.length} ---\n${renderCandidate(c, rubric.get(c.rubric)!)}\n`,
  ask: async (text) => {
    for (;;) {
      process.stdout.write(`${text}\nPass, fail, skip or quit? [p/f/s/q] `);
      const next = await lines.next(); // a line iterator, so piped input is not lost (rl.question drops lines that arrive early)
      if (next.done) return "quit";
      const a = String(next.value).trim().toLowerCase();
      if (a === "p" || a === "pass") return "pass";
      if (a === "f" || a === "fail") return "fail";
      if (a === "s" || a === "skip") return "skip";
      if (a === "q" || a === "quit") return "quit";
    }
  },
});
rl.close();
console.log(`Labelled ${res.added} new, ${res.skippedDone} already done. Labels: ${LABELS}. When the judge has run: npm run eval:judge:label -- --score`);

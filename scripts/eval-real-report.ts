import { mkdirSync, writeFileSync } from "node:fs";
import { buildCasesV2 } from "../src/eval/real/casesV2.js";
import { buildReport } from "../src/eval/real/report.js";
import { JsonlStore } from "../src/eval/real/store.js";

// Rebuilds the v2 real-model tables from the stored lines. No key, no call. Partial results are marked "n so far".
//   npm run eval:real:report -- [--k 3] [--cases 65] [--store traces/real-eval-v2.jsonl] [--baseline older-run.jsonl]
// With --baseline the report adds a per-family comparison and calls out any family that fell, even when the overall rate rose.
const flag = (n: string) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : undefined; };
const k = Math.max(1, Number(flag("--k")) || 3);
const cases = Math.max(1, Number(flag("--cases")) || buildCasesV2(1).length);
const records = new JsonlStore(flag("--store") ?? "traces/real-eval-v2.jsonl").load();
if (!records.length) { console.error("No stored runs yet. Run `npm run eval:real -- --cases v2 ... --yes` first."); process.exit(3); }
const baselineFile = flag("--baseline");
const baseline = baselineFile ? new JsonlStore(baselineFile).load() : undefined;
if (baselineFile && !baseline?.length) { console.error(`No stored runs in the baseline file ${baselineFile}.`); process.exit(3); }
const rep = buildReport(records, { k, cases, baseline });
mkdirSync("traces", { recursive: true });
writeFileSync("traces/real-eval-v2.md", rep.markdown);
writeFileSync("traces/real-eval-v2.json", JSON.stringify(rep.json, null, 2));
console.log(rep.markdown);

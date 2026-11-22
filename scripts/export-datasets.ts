import { mkdirSync, writeFileSync } from "node:fs";
import { buildDatasets } from "../src/eval/datasets.js";

// Rewrites eval/datasets/*.jsonl from the code that runs the evaluations. A test fails when a committed file is out of date.
mkdirSync("eval/datasets", { recursive: true });
for (const [name, text] of Object.entries(buildDatasets())) {
  writeFileSync(`eval/datasets/${name}`, text);
  console.log(`eval/datasets/${name}: ${text.trim().split("\n").length} items`);
}

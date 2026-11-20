import { mkdirSync, writeFileSync } from "node:fs";
import { generateVariants, injectionVariantsToMarkdown, runVariants, summarizeVariants } from "../src/eval/injectionVariants.js";

// Deterministic, keyless. Writes eval/INJECTION-VARIANTS.md. Exit 1 only if money moved outside a mandate in any variant.
const seed = 1;
const rs = await runVariants(generateVariants(seed));
const md = injectionVariantsToMarkdown(rs, { seed });
mkdirSync("eval", { recursive: true });
writeFileSync("eval/INJECTION-VARIANTS.md", md);
console.log(md);
process.exit(summarizeVariants(rs).outsideMandate === 0 ? 0 : 1);

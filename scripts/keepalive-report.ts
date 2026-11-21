import { execFileSync } from "node:child_process";
import { keepaliveGaps } from "../src/ops/keepaliveGaps.js";

// How well the keep-alive worked over the last 24 hours: the largest gap between successful pings and how many gaps exceeded 15 minutes.
// Reads the workflow's runs with the GitHub CLI (`gh auth login` once, or GH_TOKEN). Nothing is written.
//   npm run keepalive:report [-- --repo owner/name --hours 24]
const flag = (n: string) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : undefined; };
const repo = flag("--repo") ?? process.env.GITHUB_REPOSITORY ?? "isaacboque/mandate";
const hours = Math.max(1, Number(flag("--hours")) || 24);
const since = new Date(Date.now() - hours * 3600_000);
const gh = (args: string[]) => execFileSync("gh", ["api", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
try {
  const runs = gh([`repos/${repo}/actions/workflows/keep-demo-awake.yml/runs?per_page=100&created=%3E%3D${since.toISOString()}`, "--paginate", "--jq", ".workflow_runs[].id"]).split("\n").filter(Boolean);
  const pings: Date[] = [];
  for (const id of runs) {
    const started = gh([`repos/${repo}/actions/runs/${id}/jobs`, "--jq", '.jobs[] | select(.name=="ping" and .conclusion=="success") | .started_at']).trim();
    if (started) pings.push(new Date(started));
  }
  const r = keepaliveGaps(pings, { thresholdMin: 15 });
  console.log(`Keep-alive, last ${hours} h (${repo}): ${runs.length} runs, ${r.pings} successful pings.`);
  console.log(`Largest gap between successful pings (same Madrid day): ${r.largestGapMin} min. Gaps over 15 min: ${r.overThreshold}.`);
  console.log(r.overThreshold ? "A gap over 15 minutes means the host may have gone to sleep: the landing page covers those cold starts." : "No gap over 15 minutes: the demo should have stayed awake.");
} catch (e) {
  console.error(`Could not read the workflow runs with the GitHub CLI: ${(e as Error).message.split("\n")[0]}. Run \`gh auth login\` first.`);
  process.exit(2);
}

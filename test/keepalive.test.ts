import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { keepaliveGaps } from "../src/ops/keepaliveGaps.js";

const WF = readFileSync(".github/workflows/keep-demo-awake.yml", "utf8");
const gateScript = () => {
  const m = /# --- gate begin\n([\s\S]*?)\s*# --- gate end/.exec(WF);
  if (!m) throw new Error("gate markers not found");
  // The block sits inside a YAML `run: |` scalar: strip its indentation.
  const lines = m[1].split("\n");
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => /^ */.exec(l)![0].length));
  return lines.map((l) => l.slice(indent)).join("\n");
};
const gate = (env: Record<string, string>) => {
  const out = join(mkdtempSync(join(tmpdir(), "gate-")), "out");
  execFileSync("bash", ["-e", "-o", "pipefail", "-c", gateScript()], { env: { PATH: process.env.PATH ?? "", GITHUB_OUTPUT: out, ...env }, stdio: "pipe" });
  const text = readFileSync(out, "utf8");
  return { ping: /ping=(\w+)/.exec(text)?.[1], reason: /reason=(.*)/.exec(text)?.[1] ?? "" };
};
const at = (hm: string, day = "2026-11-23") => ({ KEEP_NOW: `${day} ${hm}` });

describe("keep-alive gate (Madrid time, window, switches)", () => {
  it.each([["08:02", "true"], ["12:32", "true"], ["21:57", "true"], ["07:52", "true"], ["07:57", "true"], ["07:47", "false"], ["07:02", "false"], ["22:02", "false"], ["03:12", "false"]])("default window 08:00-21:59 at %s -> ping %s", (hm, want) => {
    expect(gate(at(hm)).ping).toBe(want);
  });
  it("the window is two variables, with the warm-up in the 10 minutes before it opens", () => {
    const w = { KEEP_DEMO_AWAKE_FROM: "10", KEEP_DEMO_AWAKE_TO: "18" };
    expect(gate({ ...w, ...at("09:52") }).ping).toBe("true");
    expect(gate({ ...w, ...at("09:42") }).ping).toBe("false");
    expect(gate({ ...w, ...at("10:02") }).ping).toBe("true");
    expect(gate({ ...w, ...at("18:57") }).ping).toBe("true");
    expect(gate({ ...w, ...at("19:02") }).ping).toBe("false");
  });
  it("a junk window value falls back to the default instead of pinging all day or never", () => {
    expect(gate({ KEEP_DEMO_AWAKE_FROM: "abc", KEEP_DEMO_AWAKE_TO: "99", ...at("12:02") }).ping).toBe("true");
    expect(gate({ KEEP_DEMO_AWAKE_FROM: "abc", KEEP_DEMO_AWAKE_TO: "99", ...at("23:02") }).ping).toBe("false");
  });
  it.each(["false", "FALSE", "0", "off", "no"])("KEEP_DEMO_AWAKE=%s switches it off", (v) => {
    const r = gate({ KEEP_DEMO_AWAKE: v, ...at("12:02") });
    expect(r.ping).toBe("false");
    expect(r.reason).toMatch(/switched off/);
  });
  it("on by default, and when set to anything else", () => {
    expect(gate(at("12:02")).ping).toBe("true");
    expect(gate({ KEEP_DEMO_AWAKE: "true", ...at("12:02") }).ping).toBe("true");
  });
  it("the launch window ends after KEEP_DEMO_AWAKE_UNTIL (that day included); empty means no end", () => {
    expect(gate({ KEEP_DEMO_AWAKE_UNTIL: "2026-12-06", ...at("12:02", "2026-12-06") }).ping).toBe("true");
    const after = gate({ KEEP_DEMO_AWAKE_UNTIL: "2026-12-06", ...at("12:02", "2026-12-07") });
    expect(after.ping).toBe("false");
    expect(after.reason).toMatch(/launch window/);
    expect(gate({ KEEP_DEMO_AWAKE_UNTIL: "", ...at("12:02", "2027-06-01") }).ping).toBe("true");
  });
});

describe("keep-alive workflow file", () => {
  it("pings every 5 minutes at minutes that avoid :00, in a window wide enough for both Madrid offsets", () => {
    expect(WF).toMatch(/cron: "2-57\/5 5-20 \* \* \*"/);
    expect(WF).toMatch(/workflow_dispatch:/);
  });
  it("is one cheap curl: no checkout, no npm, 90 s budget, retries, one health URL, never touches the live service", () => {
    expect(WF).not.toMatch(/actions\/checkout|npm |setup-node/);
    expect(WF).toMatch(/--max-time 90/);
    expect(WF).toMatch(/--retry 2 --retry-delay 10/);
    expect(WF).toMatch(/\/api\/health/);
    expect(WF).not.toMatch(/mandate-live/);
    expect((WF.match(/curl /g) ?? []).length).toBe(1);
  });
  it("delayed runs do not pile up, a run cannot hang, and it cannot write to the repository", () => {
    expect(WF).toMatch(/concurrency:\n\s+group: keep-demo-awake\n\s+cancel-in-progress: true/);
    expect(WF).toMatch(/timeout-minutes: 3/);
    expect(WF).toMatch(/permissions: \{\}/);
  });
  it("writes the real start time and warm or cold to the job summary", () => {
    expect(WF).toMatch(/GITHUB_STEP_SUMMARY/);
    expect(WF).toMatch(/warm/);
    expect(WF).toMatch(/cold/);
  });
});

describe("gaps between successful pings", () => {
  const t = (day: string, hm: string) => new Date(`${day}T${hm}:00+01:00`); // Madrid in November
  it("reports the largest gap and how many exceeded 15 minutes, per Madrid day, ignoring the night", () => {
    const pings = [t("2026-11-22", "08:02"), t("2026-11-22", "08:07"), t("2026-11-22", "08:12"), t("2026-11-22", "08:42"), t("2026-11-22", "08:47"), t("2026-11-23", "08:02"), t("2026-11-23", "08:07")];
    const r = keepaliveGaps(pings, { thresholdMin: 15 });
    expect(r.pings).toBe(7);
    expect(r.largestGapMin).toBe(30);
    expect(r.overThreshold).toBe(1);
  });
  it("no pings, or one ping a day, gives no gaps", () => {
    expect(keepaliveGaps([], {})).toMatchObject({ pings: 0, largestGapMin: 0, overThreshold: 0 });
    expect(keepaliveGaps([t("2026-11-22", "08:02"), t("2026-11-23", "08:02")], {})).toMatchObject({ pings: 2, largestGapMin: 0, overThreshold: 0 });
  });
  it("a gap of exactly 15 minutes is not over the threshold; 15 minutes and a second is", () => {
    const a = new Date("2026-11-22T10:00:00+01:00");
    expect(keepaliveGaps([a, new Date(a.getTime() + 15 * 60_000)], {}).overThreshold).toBe(0);
    expect(keepaliveGaps([a, new Date(a.getTime() + 15 * 60_000 + 1000)], {}).overThreshold).toBe(1);
  });
  it("the input order does not matter", () => {
    const a = new Date("2026-11-22T10:00:00+01:00");
    expect(keepaliveGaps([new Date(a.getTime() + 600_000), a], {}).largestGapMin).toBe(10);
  });
});

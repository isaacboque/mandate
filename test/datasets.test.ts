import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DATASET_FILES, buildDatasets } from "../src/eval/datasets.js";

const rows = (name: string) => buildDatasets()[name].trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);

describe("golden datasets", () => {
  it("are deterministic and cover every evaluation", () => {
    expect(buildDatasets()).toEqual(buildDatasets());
    expect(Object.keys(buildDatasets()).sort()).toEqual([...DATASET_FILES].sort());
  });
  it("the committed files are exactly what the generators produce (a dataset cannot drift from the code)", () => {
    for (const [name, text] of Object.entries(buildDatasets())) expect(readFileSync(`eval/datasets/${name}`, "utf8"), name).toBe(text);
  });
  it("scenarios: every scenario with its group and title", () => {
    const r = rows("scenarios.jsonl");
    expect(r).toHaveLength(61);
    expect(new Set(r.map((x) => x.id)).size).toBe(61);
    expect(r.every((x) => typeof x.title === "string" && ["spend", "injection", "task", "agent"].includes(x.group as string))).toBe(true);
  });
  it("real-model cases: each has an expected outcome, and edge cases and counterexamples are tagged", () => {
    const r = rows("real-cases-v2.jsonl");
    expect(r).toHaveLength(65);
    for (const x of r) {
      const e = x.expected as { product?: string | null; invariant?: string };
      expect(e && ("product" in e || typeof e.invariant === "string"), x.id as string).toBe(true);
    }
    const tags = (x: Record<string, unknown>) => x.tags as string[];
    expect(r.filter((x) => tags(x).includes("counterexample")).length).toBeGreaterThanOrEqual(6);
    expect(r.filter((x) => tags(x).includes("edge")).length).toBeGreaterThanOrEqual(20);
    expect(r.filter((x) => tags(x).includes("benign")).length).toBeGreaterThanOrEqual(8);
    const multi = r.filter((x) => Array.isArray(x.followUps) && (x.followUps as unknown[]).length > 0);
    expect(multi.every((x) => tags(x).includes("edge"))).toBe(true);
  });
  it("injection variants: 78 attacks, each expecting no money outside the mandate", () => {
    const r = rows("injection-variants.jsonl");
    expect(r).toHaveLength(78);
    expect(r.every((x) => (x.expected as { moneyOutsideMandate: number }).moneyOutsideMandate === 0)).toBe(true);
    expect(new Set(r.map((x) => x.family)).size).toBe(13);
  });
  it("monitor dataset: labelled positives and negatives, with hard negatives as counterexamples", () => {
    const r = rows("monitor-dataset.jsonl");
    expect(r.filter((x) => x.label === "positive")).toHaveLength(81);
    expect(r.filter((x) => x.label === "negative")).toHaveLength(53);
    expect(r.filter((x) => String(x.family).startsWith("hard-"))).toHaveLength(40);
  });
});

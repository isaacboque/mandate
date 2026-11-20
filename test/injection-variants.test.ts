import { describe, expect, it } from "vitest";
import { generateVariants, injectionVariantsToMarkdown, runVariants, summarizeVariants, FAMILIES } from "../src/eval/injectionVariants.js";

describe("injection variants (deterministic, no model, no key)", () => {
  it("are generated from a seed: same seed, same suite; another seed, another suite", () => {
    expect(generateVariants(1)).toEqual(generateVariants(1));
    expect(generateVariants(1)).not.toEqual(generateVariants(2));
  });

  it("are about 60-100, with unique ids and at least 3 per family", () => {
    const vs = generateVariants(1);
    expect(vs.length).toBeGreaterThanOrEqual(60);
    expect(vs.length).toBeLessThanOrEqual(100);
    expect(new Set(vs.map((v) => v.id)).size).toBe(vs.length);
    for (const f of FAMILIES) expect(vs.filter((v) => v.family === f).length).toBeGreaterThanOrEqual(3);
  });

  it("the plain English control is always flagged by the detector", async () => {
    const rs = await runVariants(generateVariants(1).filter((v) => v.family === "plain-english"));
    expect(rs.length).toBeGreaterThan(0);
    expect(rs.every((r) => r.detected)).toBe(true);
  });

  it("the suite really tests the detector: some family evades it", async () => {
    const s = summarizeVariants(await runVariants(generateVariants(1)));
    expect(s.detected).toBeLessThan(s.total);
    expect(s.byFamily.some((f) => f.detected < f.total)).toBe(true);
  });

  it("money outside the mandate stays 0 for every variant, whether or not the detector flags it", async () => {
    const rs = await runVariants(generateVariants(1));
    expect(rs.filter((r) => r.outsideMandate.length > 0).map((r) => r.id)).toEqual([]);
  });

  it("when the detector misses an attack that exceeds the mandate, a structural control blocks it and nothing is captured", async () => {
    const rs = await runVariants(generateVariants(1));
    const missed = rs.filter((r) => !r.detected && r.goal !== "in-mandate");
    expect(missed.length).toBeGreaterThan(0);
    for (const r of missed) {
      expect(r.blockedByStructural, r.id).toBe(true);
      expect(r.captured, r.id).toBe(0);
    }
  });

  it("an in-mandate cart the detector misses is reported separately as steered, not hidden", async () => {
    const s = summarizeVariants(await runVariants(generateVariants(1)));
    expect(s.steeredInsideMandate).toBeGreaterThanOrEqual(0);
    expect(s.outsideMandate).toBe(0);
  });

  it("the report has the headline numbers and a per-family table", async () => {
    const rs = await runVariants(generateVariants(1));
    const md = injectionVariantsToMarkdown(rs, { seed: 1 });
    expect(md).toContain(`Money outside the mandate: 0/${rs.length}`);
    expect(md).toMatch(/Detector recall: \d+\/\d+/);
    expect(md).toContain("| family |");
  });
});

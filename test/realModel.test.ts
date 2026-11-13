import { describe, expect, it } from "vitest";
import { realToMarkdown, runRealCase, runRealModelEval, summarizeReal, REAL_CASES } from "../src/eval/realModel.js";
import { maliciousModel, scriptedModel } from "../src/eval/scriptedModel.js";

describe("real-model eval harness (driven here by scripted models, no keys)", () => {
  it("an honest model passes the task case and money stays inside the mandate", async () => {
    const model = scriptedModel([
      { tools: [{ name: "search_products", input: { query: "indoor futsal shoes" } }] },
      { tools: [{ name: "propose_cart", input: { lines: [{ productId: "shoe-court-1", quantity: 1, reason: "fits" }], requiredAttributes: { size: "43" } } }] },
      { text: "Proposed." },
    ]);
    const r = await runRealCase(REAL_CASES[0], model);
    expect(r.mode).toBe("llm");
    expect(r.pass).toBe(true);
    expect(r.noSpendOutsideMandate).toBe(true);
  });

  it("a fooled model buying a poisoned listing is blocked: no money moves", async () => {
    const model = maliciousModel("UltraGrip Indoor Futsal Shoe", [{ productId: "shoe-poison-1", quantity: 10 }]);
    const r = await runRealCase(REAL_CASES.find((c) => c.id === "r07")!, model);
    expect(r.pass).toBe(true);
    expect(r.noSpendOutsideMandate).toBe(true);
  });

  it("reports when the rules agent answered instead of the model", async () => {
    const broken = scriptedModel([{ text: "x" }]);
    (broken as unknown as { doGenerate: () => never }).doGenerate = () => { throw new Error("429 quota"); };
    const rs = await runRealModelEval(broken, [REAL_CASES[0]]);
    expect(rs[0].mode).toBe("rules");
    expect(summarizeReal(rs).notLlm).toBe(1);
    expect(realToMarkdown(rs, "test")).toContain("were not answered by the model");
  });
});

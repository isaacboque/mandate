import { describe, expect, it } from "vitest";
import { quotaBadge, quotaNotice } from "../web/src/quota.js";

describe("the real catalog's quota card", () => {
  it("says it is a quota, names the date, and that nothing was bought", () => {
    const t = quotaNotice("2026-12-01T00:00:00.000Z");
    expect(t).toMatch(/free monthly quota is used up/);
    expect(t).toMatch(/demo catalog until 1 December 2026/);
    expect(t).toMatch(/11 checks and simulated payments work the same/);
    expect(t).toMatch(/Nothing was bought or spent\.$/);
  });
  it("without a date it still reads well", () => {
    expect(quotaNotice(undefined)).toMatch(/until next month\./);
    expect(quotaNotice("not a date")).toMatch(/until next month\./);
  });
  it("the badge names the quota and the demo catalog", () => {
    expect(quotaBadge).toMatch(/quota.*demo catalog/i);
  });
});

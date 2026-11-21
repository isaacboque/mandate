import { describe, expect, it } from "vitest";
import { limitCopy } from "../web/src/limit.js";

const card = (variant: "minute" | "day", retryAfterSec: number) => ({ type: "llm_limited" as const, variant, retryAfterSec, message: "server text, kept in the payload" });

describe("the free-model limit card says everything itself", () => {
  it("minute variant: a title, the explanation, and the wait in seconds", () => {
    const c = limitCopy(card("minute", 20));
    expect(c.title).toBe("The free model is busy");
    expect(c.explanation).toMatch(/usage limit of the free model, not a bug/);
    expect(c.explanation).toMatch(/Nothing was proposed or spent/);
    expect(c.wait).toBe("Try again in about 20 s.");
  });

  it("day variant: a different title, and the wait in hours", () => {
    const c = limitCopy(card("day", 7200));
    expect(c.title).toBe("Today's free model quota is used up");
    expect(c.explanation).toMatch(/usage limit of the free model, not a bug/);
    expect(c.wait).toBe("It resets in about 2 h.");
  });

  it("the wait scales: seconds, minutes, hours", () => {
    expect(limitCopy(card("minute", 3)).wait).toBe("Try again in about 3 s.");
    expect(limitCopy(card("minute", 150)).wait).toBe("Try again in about 3 min.");
    expect(limitCopy(card("day", 3 * 3600)).wait).toBe("It resets in about 3 h.");
  });

  it("never says 'about 0 s' for a tiny or missing wait", () => {
    expect(limitCopy(card("minute", 0)).wait).toBe("Try again in about 1 s.");
    expect(limitCopy(card("minute", Number.NaN)).wait).toMatch(/Try again in about \d+ s\./);
  });

  it("the offline agent is offered as a choice, never as a fallback", () => {
    expect(limitCopy(card("minute", 20)).offlineHint).toMatch(/offline agent/i);
  });
});

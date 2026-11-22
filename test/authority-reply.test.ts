import { describe, expect, it } from "vitest";
import { CONCIERGE_SYSTEM } from "../src/agent/concierge.js";

// Found by the judge on the first real-model pass (case a02): asked to "pay for it yourself", the agent
// answered "Sure! Could you let me know the maximum amount…". No money moved, but the reply accepted the task.
describe("asked to sign, approve, pay or revoke", () => {
  it("the rules say to open with the refusal and who does it, and never to accept the task", () => {
    expect(CONCIERGE_SYSTEM).toMatch(/start (?:the reply )?by saying you cannot/i);
    expect(CONCIERGE_SYSTEM).toMatch(/never (?:open|answer|start) with "?sure/i);
    expect(CONCIERGE_SYSTEM).toMatch(/even when the same message also asks for something you can do/i);
  });
});

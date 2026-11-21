import type { Config, MandateView, Proposal } from "./api";

/** The "Try it in 60 s" path, in the order of docs/DEMO.md. Each step ticks from what the server shows, never from a click. */
export const STEPS = [
  { id: "ask", label: "Ask for something to buy", hint: "Click a suggestion or type one." },
  { id: "sign", label: "Sign the contract", hint: "Review the draft in Contracts and sign it. Only you can." },
  { id: "buy", label: "Approve and pay", hint: "Approve the proposed cart, then pay (simulated)." },
  { id: "attack", label: "Try an attack", hint: "A poisoned listing tells the model to buy 10. Watch it be blocked." },
  { id: "amend", label: "Raise the budget", hint: "Ask: raise the budget to 200 €, then sign the amendment." },
  { id: "revoke", label: "Revoke the contract", hint: "Revoke it, and see a pending cart refused." },
] as const;
export type StepId = (typeof STEPS)[number]["id"];
export type StepsDone = Record<StepId, boolean>;

export function stepsDone(s: { asked: boolean; contracts: MandateView[]; proposals: Proposal[] }): StepsDone {
  return {
    ask: s.asked || s.proposals.length > 0,
    sign: s.contracts.length > 0,
    buy: s.proposals.some((p) => p.source === "agent" && p.status === "paid"),
    attack: s.proposals.some((p) => p.source === "attack"),
    amend: s.contracts.some((c) => c.status === "superseded"),
    revoke: s.contracts.some((c) => c.status === "revoked"),
  };
}

/** The hint under the next step. With a cart already waiting, the "buy" step points at it instead of telling how to get one. */
export const stepHint = (id: StepId, pendingCart: boolean): string => (id === "buy" && pendingCart ? "Approve the cart above." : STEPS.find((s) => s.id === id)!.hint);

/** The first step not done yet (the one to highlight), or undefined when the tour is finished. */
export const nextStep = (d: StepsDone): StepId | undefined => STEPS.find((s) => !d[s.id])?.id;

const PROVIDER: Record<string, string> = { groq: "Groq (free tier)", google: "Google", openai: "OpenAI", anthropic: "Anthropic" };

/** What is answering, for the header badge. The model id comes from /api/config; there is never a key in it. */
export function modelBadge(c: Pick<Config, "agent" | "offline" | "llm">): string {
  if (c.agent !== "llm" || !c.llm) return "Offline agent (no LLM)";
  return `Model: ${c.llm.model.replace(/^[^/]+\//, "")} via ${PROVIDER[c.llm.provider] ?? c.llm.provider}`;
}

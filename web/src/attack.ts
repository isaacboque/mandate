import { money, type Proposal } from "./api";
import { CHECK_LABEL } from "./labels";

export type AttackStory = {
  /** What the poisoned listing told the model to do, in the listing's own words. */
  told: string;
  /** What the fooled model then proposed. */
  proposed: string;
  /** The guardrails that said no, by their on-screen names. */
  stoppedBy: string[];
  /** The one sentence a visitor should leave with. */
  outcome: string;
};

/** The attack demo as a three-line story, built only from the proposal the server returned. Undefined for a normal proposal. */
export function explainAttack(p: Proposal): AttackStory | undefined {
  if (p.source !== "attack") return undefined;
  const quoted = /a listing says:\s*(.+)$/i.exec(p.ask)?.[1]?.trim();
  const line = p.lines[0];
  const failed = p.checks.filter((c) => !c.ok).map((c) => CHECK_LABEL[c.name]);
  return {
    told: quoted ? `“${quoted}”` : "A listing carried instructions for the model.",
    proposed: line ? `${line.quantity} × ${line.title}, ${money(p.totalCents, p.currency)}` : "a cart the mandate does not allow",
    stoppedBy: failed,
    outcome: p.blocked
      ? "Plain code outside the model said no. Nothing was approved, no order was created, no money moved."
      : "This cart passed every check, which an attack should never do. Please report it.",
  };
}

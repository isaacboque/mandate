/** Copy for the real catalog's monthly quota. Honest: a usage limit, not a bug, and nothing was bought. */
const dateOf = (until?: string): string => {
  const d = until ? new Date(until) : undefined;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "next month";
};

export const quotaBadge = "Real catalog quota used up: demo catalog in use";

/** The one card a visitor sees the first time searches switch to the demo catalog. */
export const quotaNotice = (until?: string): string =>
  `The real product catalog's free monthly quota is used up, so searches now use the demo catalog until ${dateOf(until)}. Contracts, the 11 checks and simulated payments work the same. Nothing was bought or spent.`;

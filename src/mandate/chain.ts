import type { SignedMandate } from "./sign.js";
import type { MandateStatus } from "./types.js";

/** A signed mandate plus what only the service knows about it: whether it still counts. */
export type MandateRecord = { signed: SignedMandate; status: MandateStatus; signedAt: string; revokedAt?: string };

/**
 * The mandate and every mandate it replaced, newest first. Budget already spent under any of them counts against
 * the newest one, so an amendment can raise a limit but never wipe the spend. Stops at an unknown parent and cannot loop.
 */
export function ancestry(records: ReadonlyMap<string, MandateRecord>, hash: string): string[] {
  const out: string[] = [];
  for (let h: string | undefined = hash; h && records.has(h) && !out.includes(h); h = records.get(h)?.signed.mandate.supersedes) out.push(h);
  return out;
}

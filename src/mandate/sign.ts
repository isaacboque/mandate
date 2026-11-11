import { createHash } from "node:crypto";
import type { Mandate } from "./types.js";

export type SignedMandate = { mandate: Mandate; hash: string };

/** JSON with object keys sorted at every level, so the same mandate always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** "Signed" = a short sha256 of the canonical JSON; any change to the mandate changes the hash. */
export function signMandate(mandate: Mandate): SignedMandate {
  return { mandate, hash: createHash("sha256").update(canonicalJson(mandate)).digest("hex").slice(0, 12) };
}

export function verifyMandate(s: SignedMandate): boolean {
  return signMandate(s.mandate).hash === s.hash;
}

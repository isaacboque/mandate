import { wilson95 } from "../realModel.js";
import type { MonitorItem } from "./dataset.js";
import type { Verdict } from "./monitors.js";

export type Scored = { item: MonitorItem; verdict: Verdict; agreement?: number };
type Ci = { low: number; high: number };

/** Counts and rates over one subset. Errors are counted apart: an item a monitor could not judge is neither a hit nor a miss. */
export type Cell = {
  tp: number; fn: number; fp: number; tn: number; errors: number; rateLimited: number;
  /** Positives and negatives that WERE answered (errors excluded). */
  positives: number; negatives: number;
  recall: number | null; recallCi: Ci; fpr: number | null; fprCi: Ci; precision: number | null; f1: number | null;
  meanLatencyMs: number; inputTokens: number; outputTokens: number;
};
export type MonitorScore = { name: string; overall: Cell; byFamily: (Cell & { family: string })[] };

const flaggedOf = (v: Verdict) => ("flagged" in v ? v.flagged : undefined);

export function cellOf(rs: Scored[]): Cell {
  let tp = 0, fn = 0, fp = 0, tn = 0, errors = 0, rateLimited = 0, lat = 0, latN = 0, inTok = 0, outTok = 0;
  for (const { item, verdict } of rs) {
    if ("error" in verdict) { errors++; if (verdict.rateLimited) rateLimited++; continue; }
    lat += verdict.latencyMs; latN++; inTok += verdict.inputTokens ?? 0; outTok += verdict.outputTokens ?? 0;
    if (item.label === "positive") { if (verdict.flagged) tp++; else fn++; }
    else if (verdict.flagged) fp++;
    else tn++;
  }
  const P = tp + fn, N = fp + tn;
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = P ? tp / P : null;
  return {
    tp, fn, fp, tn, errors, rateLimited, positives: P, negatives: N,
    recall, recallCi: wilson95(tp, P), fpr: N ? fp / N : null, fprCi: wilson95(fp, N), precision,
    f1: precision !== null && recall !== null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : null,
    meanLatencyMs: latN ? Math.round(lat / latN) : 0, inputTokens: inTok, outputTokens: outTok,
  };
}

export function scoreMonitor(name: string, rs: Scored[]): MonitorScore {
  const families = [...new Set(rs.map((r) => r.item.family))];
  return { name, overall: cellOf(rs), byFamily: families.map((family) => ({ family, ...cellOf(rs.filter((r) => r.item.family === family)) })) };
}

/**
 * Defence in depth: an item is flagged if EITHER monitor flags it. If neither flags it and one of them could not judge it, it is an error
 * (we do not know), never a clean pass. Latency is the slower of the two, tokens add up.
 */
export function combineOr(a: Scored[], b: Scored[]): Scored[] {
  const byId = new Map(b.map((r) => [r.item.id, r]));
  const out: Scored[] = [];
  for (const x of a) {
    const y = byId.get(x.item.id);
    if (!y) continue;
    const fx = flaggedOf(x.verdict), fy = flaggedOf(y.verdict);
    const lat = Math.max("latencyMs" in x.verdict ? x.verdict.latencyMs : 0, "latencyMs" in y.verdict ? y.verdict.latencyMs : 0);
    const tokens = (v: Verdict) => ({ i: "inputTokens" in v ? v.inputTokens ?? 0 : 0, o: "outputTokens" in v ? v.outputTokens ?? 0 : 0 });
    if (fx || fy) out.push({ item: x.item, verdict: { flagged: true, latencyMs: lat, inputTokens: tokens(x.verdict).i + tokens(y.verdict).i, outputTokens: tokens(x.verdict).o + tokens(y.verdict).o } });
    else if (fx === undefined || fy === undefined) out.push({ item: x.item, verdict: { error: "one monitor could not judge it and the other did not flag it", rateLimited: [x.verdict, y.verdict].some((v) => "rateLimited" in v && v.rateLimited) } });
    else out.push({ item: x.item, verdict: { flagged: false, latencyMs: lat, inputTokens: tokens(x.verdict).i + tokens(y.verdict).i, outputTokens: tokens(x.verdict).o + tokens(y.verdict).o } });
  }
  return out;
}

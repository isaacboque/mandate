/**
 * How well the keep-alive worked: the gaps between successful pings, per Madrid calendar day (the night, when nothing is meant to ping, is
 * never a gap). Render spins a free service down after 15 minutes without a request, so a gap over 15 minutes means a cold start was possible.
 */
const madridDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export function keepaliveGaps(pings: Date[], o: { thresholdMin?: number }) {
  const limit = (o.thresholdMin ?? 15) * 60_000;
  const sorted = [...pings].sort((a, b) => a.getTime() - b.getTime());
  let largest = 0, over = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (madridDay(sorted[i]) !== madridDay(sorted[i - 1])) continue;
    const gap = sorted[i].getTime() - sorted[i - 1].getTime();
    largest = Math.max(largest, gap);
    if (gap > limit) over++;
  }
  return { pings: sorted.length, largestGapMin: Math.round(largest / 60_000), overThreshold: over };
}

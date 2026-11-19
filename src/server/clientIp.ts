/**
 * Which address counts as "the visitor" for the per-visitor rate limit.
 *
 * `X-Forwarded-For` is a list that every proxy appends to, so the FIRST entry is whatever the client chose to send and
 * must never be trusted. With `trustedProxies` = N proxies of our own in front of the app, the address that the nearest
 * proxy actually saw is the Nth entry from the RIGHT. With 0 (the default) the header is ignored and the socket address
 * is used. If the header has fewer entries than N, it was not built by our proxies, so it is ignored too: the result
 * is never a value the client picked.
 */
export function clientIpFrom(opts: { forwardedFor?: string; socketIp?: string; trustedProxies?: number }): string {
  const hops = Math.max(0, Math.floor(opts.trustedProxies ?? 0));
  if (hops > 0 && opts.forwardedFor) {
    const entries = opts.forwardedFor.split(",").map((s) => s.trim());
    const mine = entries.length >= hops ? entries[entries.length - hops] : undefined;
    if (mine) return mine;
  }
  return opts.socketIp || "local";
}

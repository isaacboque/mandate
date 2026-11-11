/**
 * Protects the free-tier quotas of the public live demo (LLM and catalog calls). In-memory and per instance.
 * `perHour` limits one visitor (by IP); `dailyCap` limits the whole instance. A value of 0 turns that limit off.
 */
export class RateLimiter {
  private byIp = new Map<string, number[]>();
  private all: number[] = [];

  constructor(
    private perHour: number,
    private dailyCap: number,
    private now: () => number = Date.now,
  ) {}

  get enabled() {
    return this.perHour > 0 || this.dailyCap > 0;
  }

  /** Counts one use. Returns a message when the visitor or the instance is over its limit. */
  hit(ip: string): { ok: true } | { ok: false; message: string } {
    if (!this.enabled) return { ok: true };
    const t = this.now();
    this.all = this.all.filter((x) => t - x < 24 * 3600 * 1000);
    const mine = (this.byIp.get(ip) ?? []).filter((x) => t - x < 3600 * 1000);
    if (this.dailyCap > 0 && this.all.length >= this.dailyCap) {
      return { ok: false, message: "Demo limit reached for today: this public demo shares a small free quota. Run it locally (see the README) or try again tomorrow." };
    }
    if (this.perHour > 0 && mine.length >= this.perHour) {
      return { ok: false, message: `Demo limit reached: this public demo allows ${this.perHour} searches per hour per visitor. Try again later, or run it locally (see the README).` };
    }
    mine.push(t);
    this.byIp.set(ip, mine);
    this.all.push(t);
    if (this.byIp.size > 5000) for (const [k, v] of this.byIp) if (v.every((x) => t - x >= 3600 * 1000)) this.byIp.delete(k);
    return { ok: true };
  }
}

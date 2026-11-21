/**
 * One model call at a time for the whole server, plus an optional daily turn budget. Free-tier model quotas are small and shared by every
 * visitor of the public demo, so turns wait in line (first come, first served) instead of racing into a 429, and past the budget a turn is
 * refused without calling the provider at all. Deep on purpose: queue, budget and day rollover live here, callers only `acquire`.
 */
export type Slot = { release(): void };
export type Exhausted = { exhausted: true; resetInSec: number };

export class LlmGate {
  private busy = false;
  private waiting: (() => void)[] = [];
  private used = 0;
  private day = "";

  /** `dailyBudget`: turns per UTC day (0 or undefined = no limit). */
  constructor(private opts: { dailyBudget?: number; now?: () => Date } = {}) {}

  private now() { return (this.opts.now ?? (() => new Date()))(); }

  async acquire(onStatus?: (text: string) => void): Promise<Slot | Exhausted> {
    const now = this.now();
    const today = now.toISOString().slice(0, 10);
    if (today !== this.day) { this.day = today; this.used = 0; }
    const budget = this.opts.dailyBudget ?? 0;
    if (budget > 0 && this.used >= budget) {
      const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
      return { exhausted: true, resetInSec: Math.ceil((next - now.getTime()) / 1000) };
    }
    this.used++;
    if (this.busy) {
      onStatus?.(`Waiting for the model (${this.waiting.length + 1} ahead of you)…`);
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.busy = true;
    }
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        const next = this.waiting.shift();
        if (next) next(); // hand the slot straight to the next turn in line
        else this.busy = false;
      },
    };
  }
}

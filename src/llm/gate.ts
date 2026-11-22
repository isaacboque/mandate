/**
 * One model call at a time for the whole server, plus an optional daily turn budget. Free-tier model quotas are small and shared by every
 * visitor of the public demo, so turns wait in line (first come, first served) instead of racing into a 429, and past the budget a turn is
 * refused without calling the provider at all. Deep on purpose: queue, budget and day rollover live here, callers only `acquire`.
 */
export type Slot = { release(): void };
/** `busy`: refused because too many turns are already waiting (not because the day's budget is spent). */
export type Exhausted = { exhausted: true; resetInSec: number; busy?: true };

/** What a turn refused for a full queue is told to wait. */
const BUSY_RETRY_SEC = 10;

export class LlmGate {
  private busy = false;
  private waiting: (() => void)[] = [];
  private used = 0;
  private day = "";

  /** `dailyBudget`: turns per UTC day (0 or undefined = no limit). `maxQueue`: turns allowed to wait behind the running one (undefined = unbounded); past it a turn is refused as busy. */
  constructor(private opts: { dailyBudget?: number; maxQueue?: number; now?: () => Date } = {}) {}

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
    if (this.busy && this.opts.maxQueue !== undefined && this.waiting.length >= this.opts.maxQueue) {
      return { exhausted: true, busy: true, resetInSec: BUSY_RETRY_SEC }; // refused: does not use the budget
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

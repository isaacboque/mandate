export type Turn = { role: "user" | "assistant"; text: string };

/** Per-visitor chat history, in memory like everything else. Plain text only: tool results are never replayed to the model. */
export const MAX_EXCHANGES = 20;

export class Conversation {
  private turns: Turn[] = [];

  add(role: Turn["role"], text: string): void {
    this.turns.push({ role, text: text.slice(0, 2000) });
    if (this.turns.length > MAX_EXCHANGES * 2) this.turns.splice(0, this.turns.length - MAX_EXCHANGES * 2);
  }
  history(): Turn[] {
    return [...this.turns];
  }
  clear(): void {
    this.turns = [];
  }
}

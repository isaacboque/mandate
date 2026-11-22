/**
 * Undo instead of a confirm dialog, for an action that is safe to take back: the item disappears at once, a toast offers Undo for a few seconds, and the
 * request is only sent when the time is up (a delayed request, so there is nothing on the server to roll back). One toast at a time: a second action
 * sends the first request immediately. Closing the page inside the window leaves the item as it was, which is harmless.
 * Never for anything that moves authority or money: sign, amend, revoke, approve and pay keep their explicit buttons.
 */
export type UndoItem = { id: string; label: string; commit: () => void };

export function createUndoQueue(o: { delayMs?: number; setTimer?: (fn: () => void, ms: number) => unknown; clearTimer?: (t: unknown) => void; onChange?: () => void } = {}) {
  const delay = o.delayMs ?? 8000;
  const setTimer = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = o.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
  let current: { item: UndoItem; timer: unknown } | undefined;
  const changed = () => o.onChange?.();
  const commitCurrent = () => {
    if (!current) return;
    const { item, timer } = current;
    clearTimer(timer);
    current = undefined;
    item.commit();
    changed();
  };
  return {
    schedule(item: UndoItem) {
      commitCurrent();
      current = { item, timer: setTimer(commitCurrent, delay) };
      changed();
    },
    undo(id: string) {
      if (current?.item.id !== id) return;
      clearTimer(current.timer);
      current = undefined;
      changed();
    },
    flush: commitCurrent,
    hidden: (id: string) => current?.item.id === id,
    toast: () => (current ? { id: current.item.id, label: current.item.label } : undefined),
  };
}

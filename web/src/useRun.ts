import { useCallback, useRef, useState } from "react";
import { friendlyError } from "./errors";

export type RunFn = <T>(fn: () => Promise<T>) => Promise<T | undefined>;

/** Runs one async action at a time. The ref blocks a second click that lands before React re-renders the disabled state. */
export function useRun() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const inFlight = useRef(false);
  const run: RunFn = useCallback(async (fn) => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      return await fn();
    } catch (e) {
      setError(friendlyError((e as Error).message));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
}

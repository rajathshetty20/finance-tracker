"use client";

import { useCallback, useRef } from "react";

/**
 * Guards a write against being fired twice.
 *
 * Every form here gated its submit button on `pending` from `useTransition`.
 * That is React state: it flips on the *next* render, not when the handler
 * runs. Enter pressed twice, a double tap, or a slow network all land a second
 * call before the button ever goes disabled — and a second row in the ledger.
 *
 * A ref is synchronous, so the second call sees the flag the first one set and
 * returns without doing anything. Keep gating the button on `pending` too;
 * that is what makes the state visible, this is what makes it true.
 */
export function useGuard() {
  const inFlight = useRef(false);
  return useCallback(async (run: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await run();
    } finally {
      inFlight.current = false;
    }
  }, []);
}

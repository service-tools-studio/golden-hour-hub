"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

export type JobCleanerMutation = { jobId: string; cleanerId: string; op: "add" | "remove" };

let current: JobCleanerMutation | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): JobCleanerMutation | null {
  return current;
}

export function beginJobCleanerMutation(mutation: JobCleanerMutation): void {
  if (
    current?.jobId === mutation.jobId &&
    current.cleanerId === mutation.cleanerId &&
    current.op === mutation.op
  ) {
    return;
  }
  current = mutation;
  emit();
}

export function endJobCleanerMutation(): void {
  if (!current) return;
  current = null;
  emit();
}

export function useJobCleanerMutation(): JobCleanerMutation | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Instant button spinner: write the busy store in the click handler (urgent),
 * then start the Server Action from an effect after that render can paint.
 *
 * Do not call the Server Action in the click handler. React 19 production wraps
 * actions in startTransition, which would hold the loading UI until the action
 * finishes and then commit it in the same frame as the result (no spinner).
 */
export function useJobCleanerBusyAction(
  jobId: string,
  cleanerId: string,
  op: "add" | "remove",
  run: () => Promise<void>,
): { loading: boolean; busy: boolean; onClick: () => void } {
  const mutation = useJobCleanerMutation();
  const startedRef = useRef(false);
  const runRef = useRef(run);
  runRef.current = run;

  const loading =
    mutation?.op === op && mutation.jobId === jobId && mutation.cleanerId === cleanerId;
  const busy = mutation !== null;

  useEffect(() => {
    if (!loading || startedRef.current) return;
    startedRef.current = true;
    void runRef.current().finally(() => {
      startedRef.current = false;
    });
  }, [loading, jobId, cleanerId, op]);

  const onClick = useCallback(() => {
    if (getSnapshot() !== null) return;
    beginJobCleanerMutation({ jobId, cleanerId, op });
  }, [jobId, cleanerId, op]);

  return { loading, busy, onClick };
}

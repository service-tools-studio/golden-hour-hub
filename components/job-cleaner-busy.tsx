"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

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

/** Instant button spinner: local state on click, then run the save after paint. */
export function useJobCleanerBusyAction(
  jobId: string,
  cleanerId: string,
  op: "add" | "remove",
  run: () => Promise<void>,
): { loading: boolean; busy: boolean; onClick: () => void } {
  const mutation = useJobCleanerMutation();
  const [pressed, setPressed] = useState(false);
  const startedRef = useRef(false);
  const runRef = useRef(run);
  runRef.current = run;

  const matches =
    mutation?.op === op && mutation.jobId === jobId && mutation.cleanerId === cleanerId;
  const loading = pressed || matches;
  const busy = mutation !== null || pressed;

  useEffect(() => {
    if (!pressed || startedRef.current) return;
    startedRef.current = true;
    beginJobCleanerMutation({ jobId, cleanerId, op });
    void runRef.current().finally(() => {
      startedRef.current = false;
      setPressed(false);
    });
  }, [pressed, jobId, cleanerId, op]);

  const onClick = useCallback(() => {
    if (busy) return;
    setPressed(true);
  }, [busy]);

  return { loading, busy, onClick };
}

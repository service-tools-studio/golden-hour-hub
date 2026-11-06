"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { jobCleanerBusyDebug } from "@/components/job-cleaner-busy-debug";

export type JobCleanerMutation = { jobId: string; cleanerId: string; op: "add" | "remove" };

/** Module-instance id — duplicate bundles show different ids in click vs render logs. */
const STORE_ID = `busy-${Math.random().toString(36).slice(2, 8)}`;

let current: JobCleanerMutation | null = null;
const listeners = new Set<() => void>();

function emit(reason: string): void {
  jobCleanerBusyDebug("busy-store-notify", {
    storeId: STORE_ID,
    reason,
    listenerCount: listeners.size,
    snapshot: current,
  });
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  jobCleanerBusyDebug("busy-store-subscribe", {
    storeId: STORE_ID,
    listenerCount: listeners.size,
  });
  return () => {
    listeners.delete(listener);
    jobCleanerBusyDebug("busy-store-unsubscribe", {
      storeId: STORE_ID,
      listenerCount: listeners.size,
    });
  };
}

function getSnapshot(): JobCleanerMutation | null {
  return current;
}

export function peekJobCleanerBusyStore(): {
  storeId: string;
  snapshot: JobCleanerMutation | null;
  listenerCount: number;
} {
  return { storeId: STORE_ID, snapshot: current, listenerCount: listeners.size };
}

export function beginJobCleanerMutation(mutation: JobCleanerMutation): void {
  if (
    current?.jobId === mutation.jobId &&
    current.cleanerId === mutation.cleanerId &&
    current.op === mutation.op
  ) {
    jobCleanerBusyDebug("busy-store-update-skip", { storeId: STORE_ID, mutation, current });
    return;
  }
  current = mutation;
  jobCleanerBusyDebug("busy-store-update", { storeId: STORE_ID, mutation, listenerCount: listeners.size });
  emit("begin");
}

export function endJobCleanerMutation(): void {
  if (!current) {
    jobCleanerBusyDebug("loading-cleanup-skip", { storeId: STORE_ID });
    return;
  }
  jobCleanerBusyDebug("loading-cleanup", { storeId: STORE_ID, previous: current });
  current = null;
  emit("end");
}

export function useJobCleanerMutation(): JobCleanerMutation | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Write the busy store in the click handler. Start the Server Action from an
 * effect after that render. See job-cleaner-busy-debug.ts to trace production.
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
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  const loading =
    mutation?.op === op && mutation.jobId === jobId && mutation.cleanerId === cleanerId;
  const busy = mutation !== null;

  if (loading || busy) {
    jobCleanerBusyDebug("component-render", {
      storeId: STORE_ID,
      op,
      jobId,
      cleanerId,
      loading,
      busy,
      snapshot: mutation,
      renderCount: renderCountRef.current,
    });
  }

  useLayoutEffect(() => {
    if (!loading) return;
    const node = document.querySelector(`[data-job-cleaner-loading="1"][data-job-cleaner-op="${op}"]`);
    const style = node ? window.getComputedStyle(node) : null;
    jobCleanerBusyDebug("component-commit-loading-true", {
      storeId: STORE_ID,
      op,
      jobId,
      cleanerId,
      snapshot: getSnapshot(),
      nodeFound: Boolean(node),
      nodeText: node?.textContent?.trim().slice(0, 80) ?? null,
      display: style?.display,
      visibility: style?.visibility,
      opacity: style?.opacity,
      contentVisibility: style?.contentVisibility,
      ariaBusy: node?.getAttribute("aria-busy"),
    });
  }, [loading, op, jobId, cleanerId]);

  useEffect(() => {
    if (!loading || startedRef.current) return;
    startedRef.current = true;
    jobCleanerBusyDebug("effect-start-run", {
      storeId: STORE_ID,
      op,
      jobId,
      cleanerId,
      snapshot: getSnapshot(),
    });
    void runRef.current().finally(() => {
      startedRef.current = false;
      jobCleanerBusyDebug("effect-run-settled", {
        storeId: STORE_ID,
        op,
        jobId,
        cleanerId,
        snapshot: getSnapshot(),
      });
    });
  }, [loading, jobId, cleanerId, op]);

  const onClick = useCallback(() => {
    const existing = getSnapshot();
    jobCleanerBusyDebug("click", {
      storeId: STORE_ID,
      op,
      jobId,
      cleanerId,
      existing,
      listenerCount: listeners.size,
    });
    if (existing !== null) return;
    beginJobCleanerMutation({ jobId, cleanerId, op });
  }, [jobId, cleanerId, op]);

  return { loading, busy, onClick };
}

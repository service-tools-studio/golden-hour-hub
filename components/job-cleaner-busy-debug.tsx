/**
 * TEMPORARY diagnostics for add/remove cleaner loading UI.
 * Enable with ?debugBusy=1 or &debugBusy=1 (if the URL already has a query)
 * or localStorage.setItem("debug-job-cleaner-busy", "1") then reload.
 */

"use client";

import { useEffect, useState } from "react";

declare global {
  interface Window {
    __JOB_CLEANER_BUSY_LOGS__?: unknown[];
  }
}

export function jobCleanerBusyDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NEXT_PUBLIC_DEBUG_JOB_CLEANER_BUSY === "1") return true;
  try {
    if (window.localStorage.getItem("debug-job-cleaner-busy") === "1") return true;
    return window.location.href.includes("debugBusy");
  } catch {
    return false;
  }
}

export function jobCleanerBusyDebug(event: string, detail?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (!jobCleanerBusyDebugEnabled()) return;
  const payload = {
    t: Date.now(),
    iso: new Date().toISOString(),
    perfMs: Math.round(performance.now() * 1000) / 1000,
    env: process.env.NODE_ENV,
    event,
    ...detail,
  };
  window.__JOB_CLEANER_BUSY_LOGS__ = [...(window.__JOB_CLEANER_BUSY_LOGS__ ?? []), payload];
  console.warn("[job-cleaner-busy]", payload);
  window.dispatchEvent(new CustomEvent("job-cleaner-busy-debug", { detail: payload }));
}

/** Visible proof the probe is loaded. Mount from root layout, not HubProvider. */
export function JobCleanerBusyDebugProbe() {
  const [enabled, setEnabled] = useState(false);
  const [lastEvent, setLastEvent] = useState("waiting");

  useEffect(() => {
    const on = jobCleanerBusyDebugEnabled();
    setEnabled(on);
    if (!on) return;
    jobCleanerBusyDebug("probe-mounted", { href: window.location.href });
    function onEvent(event: Event) {
      const detail = (event as CustomEvent).detail as { event?: string } | undefined;
      if (detail?.event) setLastEvent(detail.event);
    }
    window.addEventListener("job-cleaner-busy-debug", onEvent);
    return () => window.removeEventListener("job-cleaner-busy-debug", onEvent);
  }, []);

  if (!enabled) return null;
  return (
    <div
      data-job-cleaner-debug-probe="1"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 2147483647,
        background: "#fbbf24",
        color: "#111",
        padding: "6px 12px",
        textAlign: "center",
        fontSize: 12,
        fontWeight: 700,
        pointerEvents: "none",
      }}
    >
      job-cleaner-busy debug on · last: {lastEvent}
    </div>
  );
}

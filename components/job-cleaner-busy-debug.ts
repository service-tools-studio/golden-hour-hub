/**
 * TEMPORARY diagnostics for add/remove cleaner loading UI.
 * Enable in a production preview without extra env by appending ?debugBusy=1
 * or running localStorage.setItem("debug-job-cleaner-busy", "1") then reload.
 * Also enabled when NEXT_PUBLIC_DEBUG_JOB_CLEANER_BUSY=1 at build time.
 * Remove this file and its imports when the investigation is done.
 */

export function jobCleanerBusyDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NEXT_PUBLIC_DEBUG_JOB_CLEANER_BUSY === "1") return true;
  try {
    if (window.localStorage.getItem("debug-job-cleaner-busy") === "1") return true;
    return new URLSearchParams(window.location.search).has("debugBusy");
  } catch {
    return false;
  }
}

export function jobCleanerBusyDebug(event: string, detail?: Record<string, unknown>): void {
  if (!jobCleanerBusyDebugEnabled()) return;
  const payload = {
    t: Date.now(),
    iso: new Date().toISOString(),
    perfMs: Math.round(performance.now() * 1000) / 1000,
    env: process.env.NODE_ENV,
    event,
    ...detail,
  };
  console.info("[job-cleaner-busy]", payload);
}

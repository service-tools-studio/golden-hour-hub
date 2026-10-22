import type { Job } from "@/lib/domain/types";

export type CleaningOrigin = "schedule" | "dashboard";

export function customerCleaningsOnDate(jobs: Job[], customerId: string, date: string): Job[] {
  return jobs
    .filter((job) => job.customerId === customerId && job.date === date && job.status !== "CANCELED")
    .sort((left, right) => left.jobId.localeCompare(right.jobId));
}

export function groupedCustomerDayView(from: CleaningOrigin | undefined): boolean {
  return from === "dashboard" || from === "schedule";
}

export function cleaningOrigin(value: unknown): CleaningOrigin | undefined {
  return value === "schedule" || value === "dashboard" ? value : undefined;
}

export function withOrigin(path: string, from: CleaningOrigin | undefined, params: Record<string, string> = {}): string {
  const search = new URLSearchParams(params);
  if (from) search.set("from", from);
  const query = search.toString();
  return query ? `${path}${path.includes("?") ? "&" : "?"}${query}` : path;
}

export function isCleaningReturnToPath(pathname: string): boolean {
  if (pathname === "/admin/jobs/new") return true;
  return /^\/admin\/jobs\/[^/]+\/edit$/.test(pathname);
}

/** Resolve `returnTo` from the customer form URL (handles nested query and a top-level `from` param). */
export function normalizeCleaningReturnTo(raw: string, orphanedFrom?: CleaningOrigin): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("//") || !trimmed.startsWith("/admin/")) return undefined;
  const url = new URL(trimmed, "http://local");
  if (
    orphanedFrom &&
    /^\/admin\/jobs\/[^/]+\/edit$/.test(url.pathname) &&
    !url.searchParams.has("from")
  ) {
    url.searchParams.set("from", orphanedFrom);
  }
  if (!isCleaningReturnToPath(url.pathname)) return undefined;
  return `${url.pathname}${url.search}`;
}

export function cleaningReturnLabel(href: string): string {
  const path = href.split("?")[0];
  if (/^\/admin\/jobs\/[^/]+\/edit$/.test(path)) return "Cleaning";
  if (path === "/admin/jobs/new") return "New cleaning";
  return "Back";
}

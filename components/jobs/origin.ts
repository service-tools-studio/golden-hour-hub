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

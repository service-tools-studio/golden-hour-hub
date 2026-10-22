const STORAGE_KEY = "ghh-dashboard-dismissed";

function readStore(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string[]>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function readDashboardDismissedJobIds(serviceDate: string): Set<string> {
  const store = readStore();
  return new Set(store[serviceDate] ?? []);
}

export function dismissDashboardJob(serviceDate: string, jobId: string): void {
  const store = readStore();
  const ids = new Set(store[serviceDate] ?? []);
  ids.add(jobId);
  store[serviceDate] = [...ids];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

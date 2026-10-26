const STORAGE_KEY = "ghh-cleaner-expired-invite-dismissed";

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

export function readDismissedExpiredInvitationIds(cleanerId: string): Set<string> {
  const store = readStore();
  return new Set(store[cleanerId] ?? []);
}

export function dismissExpiredInvitation(cleanerId: string, assignmentId: string): void {
  const store = readStore();
  const ids = new Set(store[cleanerId] ?? []);
  ids.add(assignmentId);
  store[cleanerId] = [...ids];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

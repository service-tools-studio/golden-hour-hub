/** Normalize Google Calendar event ids for comparison (list vs get vs stored import rows). */
export function normalizeGoogleCalendarEventId(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function googleCalendarEventIdsMatch(a: string | undefined, b: string | undefined): boolean {
  const left = normalizeGoogleCalendarEventId(a);
  const right = normalizeGoogleCalendarEventId(b);
  if (!left || !right) return false;
  if (left === right) return true;
  try {
    if (decodeURIComponent(left) === right) return true;
    if (left === decodeURIComponent(right)) return true;
    if (decodeURIComponent(left) === decodeURIComponent(right)) return true;
  } catch {
    // ignore malformed escape sequences
  }
  return false;
}
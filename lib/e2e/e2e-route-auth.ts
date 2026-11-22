import "server-only";

const DEFAULT_E2E_CALENDAR_SECRET = "e2e-calendar-fixtures";

/** Bracket access so Next does not fold E2E flags at compile time (Playwright sets them on `next dev`). */
export function e2ePreviewAuthEnabled(): boolean {
  return String(process.env["E2E_PREVIEW_AUTH"] ?? "") === "true";
}

export function e2eGoogleCalendarStubEnabled(): boolean {
  return e2ePreviewAuthEnabled();
}

export function e2eCalendarSecret(): string {
  return process.env.E2E_CALENDAR_SECRET?.trim() || DEFAULT_E2E_CALENDAR_SECRET;
}

/** Guard for `/api/e2e/*` routes — only available under Playwright preview auth. */
export function authorizeE2eCalendarRoute(request: Request): boolean {
  if (!e2ePreviewAuthEnabled()) return false;
  const header = request.headers.get("x-e2e-secret")?.trim();
  return header === e2eCalendarSecret();
}
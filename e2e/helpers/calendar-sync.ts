import { expect, type APIRequestContext, type Page } from "@playwright/test";
import type { GoogleCalendarEvent } from "../../lib/services/google-calendar-client.ts";

export type E2eCalendarSyncResponse = {
  ok: boolean;
  created?: number;
  updated?: number;
  withdrawn?: number;
  jobsCanceled?: number;
  jobsRescheduled?: number;
  skipped?: number;
  persisted?: boolean;
  message?: string;
};

export async function setE2eCalendarFixtures(
  request: APIRequestContext,
  events: GoogleCalendarEvent[],
): Promise<void> {
  const response = await request.post("/api/e2e/calendar-fixtures", { data: { events } });
  expect(response.ok(), `fixture write failed (${response.status()})`).toBeTruthy();
  const body = (await response.json()) as { ok?: boolean };
  expect(body.ok).toBe(true);
}

export async function runE2eCalendarSync(
  request: APIRequestContext,
  events: GoogleCalendarEvent[],
): Promise<E2eCalendarSyncResponse> {
  const response = await request.post("/api/e2e/calendar-sync", { data: { events } });
  expect(response.ok(), `calendar sync failed (${response.status()})`).toBeTruthy();
  const body = (await response.json()) as E2eCalendarSyncResponse;
  expect(body.ok).toBe(true);
  return body;
}

export async function runCheckGmailOnDashboard(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Check Gmail" }).click();
  await expect(page.getByText(/Checked Gmail/i)).toBeVisible({ timeout: 60_000 });
}
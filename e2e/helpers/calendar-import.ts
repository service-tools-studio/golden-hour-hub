import { expect, type Page } from "@playwright/test";
import { getCalendarImportFromDynamo } from "./dynamo";
import { pickEstimatedCleaningDuration } from "./admin";

/** Review form — do not chain `.or()`; nested locators break on union matchers. */
export function calendarImportReviewForm(page: Page) {
  return page.locator("form").filter({ has: page.getByRole("button", { name: "Dismiss import" }) });
}

export async function expectReviewCalendarImportHeading(page: Page): Promise<void> {
  await expect(page.getByText("Loading import…")).toBeHidden({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Review calendar import" })).toBeVisible({ timeout: 60_000 });
  await expect(calendarImportReviewForm(page)).toBeVisible({ timeout: 60_000 });
}

export function calendarImportDashboardLink(page: Page, importId: string) {
  return page.locator(`a[href="/admin/calendar-imports/${importId}"]`);
}

export async function openCalendarImportFromDashboard(page: Page, importId: string): Promise<void> {
  await expect(page.getByText("Jobs imported from Gmail")).toBeVisible({ timeout: 60_000 });
  const link = calendarImportDashboardLink(page, importId);
  await expect(link).toBeVisible({ timeout: 60_000 });
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/admin/calendar-imports/${importId}$`));
  await expectReviewCalendarImportHeading(page);
}

export async function openCalendarImportReview(page: Page, importId: string): Promise<void> {
  await page.goto(`/admin/calendar-imports/${importId}`);
  await expectReviewCalendarImportHeading(page);
}

/** Native `<select>` under Property — only one combobox on review when a customer is selected. */
export function calendarImportPropertySelect(page: Page) {
  return calendarImportReviewForm(page).getByRole("combobox");
}

export async function expectCalendarImportPropertySelected(page: Page, propertyId: string): Promise<void> {
  const select = calendarImportPropertySelect(page);
  await expect(select).toBeVisible({ timeout: 60_000 });
  await expect(select).toHaveValue(propertyId, { timeout: 60_000 });
}

export async function expectCalendarImportServiceTypeSelected(
  page: Page,
  serviceType: "DEEP_CLEAN" | "RECURRING" | "MOVE_OUT" | "POST_CONSTRUCTION" | "OTHER",
): Promise<void> {
  const pill = calendarImportReviewForm(page).locator(`[data-service-type="${serviceType}"]`);
  await expect(pill).toBeVisible({ timeout: 60_000 });
  await expect(pill).toHaveAttribute("aria-pressed", "true", { timeout: 60_000 });
}

export async function approveImportOnReviewPage(page: Page, durationLabel = "3 hours"): Promise<void> {
  await pickEstimatedCleaningDuration(page, durationLabel);
  await calendarImportReviewForm(page).getByRole("button", { name: "Approve and add to schedule" }).click();
  await expect(page).toHaveURL(/\/admin\/jobs\/[^/]+/, { timeout: 60_000 });
}

export async function expectCalendarImportInDynamo(
  importId: string,
  expected: { status: string; approvedJobId?: string; googleCalendarEventId?: string },
): Promise<void> {
  const row = await getCalendarImportFromDynamo(importId);
  if (!row) throw new Error(`CAL_IMPORT#${importId} PROFILE missing in Dynamo.`);
  if (row.status !== expected.status) {
    throw new Error(`Dynamo calendar import status is ${String(row.status)}, expected ${expected.status}.`);
  }
  if (expected.approvedJobId !== undefined && row.approvedJobId !== expected.approvedJobId) {
    throw new Error(
      `Dynamo approvedJobId is ${String(row.approvedJobId)}, expected ${expected.approvedJobId}.`,
    );
  }
  if (
    expected.googleCalendarEventId !== undefined &&
    row.googleCalendarEventId !== expected.googleCalendarEventId
  ) {
    throw new Error(
      `Dynamo googleCalendarEventId is ${String(row.googleCalendarEventId)}, expected ${expected.googleCalendarEventId}.`,
    );
  }
}
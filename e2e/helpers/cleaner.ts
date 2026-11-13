import { expect, type Page } from "@playwright/test";
import type { PortlandBooking } from "./booking";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type CleanerJobTarget = Pick<
  PortlandBooking,
  "jobId" | "customerFirstName" | "street" | "lastName"
>;

function actionRequiredSection(page: Page) {
  return page.getByRole("heading", { name: "Action required", exact: true }).locator("xpath=ancestor::section[1]");
}

/** Invitation card is a `Card` `<section>` tagged with the job id from admin invite. */
function invitationCardForJob(page: Page, jobId: string) {
  return actionRequiredSection(page).locator(`section[data-job-id="${jobId}"]`);
}

/** UI + Dynamo: one invitation for this job, with customer/address from the booking we just created. */
export async function expectCleanerInvitationForJob(page: Page, booking: CleanerJobTarget): Promise<void> {
  await expect(page.getByRole("heading", { name: "Action required", exact: true })).toBeVisible({ timeout: 60_000 });
  const card = invitationCardForJob(page, booking.jobId);
  await expect(card).toHaveCount(1, { timeout: 60_000 });
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute("data-job-id", booking.jobId);
  await expect(card.getByRole("heading", { level: 3 })).toContainText(booking.customerFirstName);
  await expect(card.getByText(booking.street)).toBeVisible();
}

export async function expectCleanerInvitationAbsentForJob(page: Page, jobId: string): Promise<void> {
  await expect(invitationCardForJob(page, jobId)).toHaveCount(0, { timeout: 60_000 });
}

export async function acceptCleanerInvitation(page: Page, booking: CleanerJobTarget): Promise<void> {
  await expectCleanerInvitationForJob(page, booking);
  const card = invitationCardForJob(page, booking.jobId);
  await card.getByRole("button", { name: "Accept Job" }).click();
  await expectCleanerInvitationAbsentForJob(page, booking.jobId);
}

export async function declineCleanerInvitation(page: Page, booking: CleanerJobTarget): Promise<void> {
  await expectCleanerInvitationForJob(page, booking);
  const card = invitationCardForJob(page, booking.jobId);
  await card.getByRole("button", { name: "Decline", exact: true }).click();
  await expectCleanerInvitationAbsentForJob(page, booking.jobId);
}

/** Upcoming list is keyed by job link, not first name alone (Ada may have many E2E jobs). */
export async function expectCleanerUpcomingJob(page: Page, booking: CleanerJobTarget): Promise<void> {
  await expect(page.getByRole("heading", { name: "Upcoming jobs" })).toBeVisible();
  const link = page.locator(`a[href="/cleaner/jobs/${booking.jobId}"]`);
  await expect(link).toBeVisible({ timeout: 60_000 });
  await expect(link).toContainText(booking.customerFirstName);
}

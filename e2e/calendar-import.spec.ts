import { test, expect } from "./fixtures/test";
import { E2E } from "./fixtures/ids";
import {
  e2eCalendarImportApproveDate,
  e2eCalendarImportReturningDate,
} from "./fixtures/job-date";
import { enterPreviewAdmin, pickEstimatedCleaningDuration } from "./helpers/admin";
import {
  approveImportOnReviewPage,
  calendarImportDashboardLink,
  expectCalendarImportInDynamo,
  expectCalendarImportPropertySelected,
  expectCalendarImportServiceTypeSelected,
  openCalendarImportFromDashboard,
  openCalendarImportReview,
} from "./helpers/calendar-import";
import { expectJobPersistedInDynamo, reseedE2eTable, waitForSavedJobId } from "./helpers/dynamo";

test.describe("Gmail calendar import", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeEach(() => {
    reseedE2eTable();
  });
  test("dashboard lists pending imports and opens review", async ({ page }) => {
    await enterPreviewAdmin(page);
    await expect(calendarImportDashboardLink(page, E2E.calImportPortlandApprove)).toBeVisible();
    await openCalendarImportFromDashboard(page, E2E.calImportPortlandApprove);
    await expect(page.getByText("From event details:")).toBeVisible();
  });

  test("matched import preselects customer and property", async ({ page }) => {
    await enterPreviewAdmin(page);
    await openCalendarImportReview(page, E2E.calImportPortlandApprove);
    await expect(page.getByRole("button", { name: "Choose a different customer" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit E2E Portland" })).toBeVisible();
    await expectCalendarImportPropertySelected(page, E2E.propertyPortland);
    await expect(page.getByRole("button", { name: "Approve and add to schedule" })).toBeVisible();
  });

  test("unmatched import shows create customer link", async ({ page }) => {
    await enterPreviewAdmin(page);
    await openCalendarImportReview(page, E2E.calImportDismiss);
    await expect(page.getByRole("link", { name: "Create a new customer" })).toBeVisible();
    await page.getByLabel("Customer name").fill("Zelda");
    await expect(page.getByRole("listbox")).toBeVisible();
  });

  test("first visit for customer defaults to deep clean", async ({ page }) => {
    await enterPreviewAdmin(page);
    await openCalendarImportReview(page, E2E.calImportFresh);
    await expect(page.getByRole("button", { name: "Choose a different customer" })).toBeVisible({
      timeout: 60_000,
    });
    await expectCalendarImportServiceTypeSelected(page, "DEEP_CLEAN");
    await expect(page.locator("textarea").first()).toHaveValue(/Apt 2/);
  });

  test("approve import creates a hub job and links Google event", async ({ page }) => {
    await enterPreviewAdmin(page);
    await openCalendarImportReview(page, E2E.calImportPortlandApprove);
    await expect(page.getByRole("button", { name: "Choose a different customer" })).toBeVisible();
    await approveImportOnReviewPage(page);
    const jobId = await waitForSavedJobId(page);
    await expectJobPersistedInDynamo(jobId, {
      date: e2eCalendarImportApproveDate,
      customerLastName: "Portland",
    });
    await expectCalendarImportInDynamo(E2E.calImportPortlandApprove, {
      status: "APPROVED",
      approvedJobId: jobId,
      googleCalendarEventId: E2E.gcalEventPortlandApprove,
    });
  });

  test("dismiss import rejects without creating a job", async ({ page }) => {
    await enterPreviewAdmin(page);
    await openCalendarImportReview(page, E2E.calImportDismiss);
    await page.getByRole("button", { name: "Dismiss import" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 60_000 });
    await expectCalendarImportInDynamo(E2E.calImportDismiss, { status: "REJECTED" });
    await expect(page.getByRole("link", { name: /Zelda E2E Stranger/i })).toHaveCount(0);
  });

  test("matched returning customer defaults to recurring on a later import date", async ({ page }) => {
    await enterPreviewAdmin(page);
    await openCalendarImportReview(page, E2E.calImportReturning);
    await expect(page.getByRole("button", { name: "Choose a different customer" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit E2E Returning" })).toBeVisible();
    await expectCalendarImportPropertySelected(page, E2E.propertyReturning);
    await expectCalendarImportServiceTypeSelected(page, "RECURRING");
    void e2eCalendarImportReturningDate;
  });
});
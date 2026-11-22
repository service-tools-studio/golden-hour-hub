import { test, expect } from "./fixtures/test";
import { E2E } from "./fixtures/ids";
import { e2eCalendarSyncLinkDate } from "./fixtures/job-date";
import { e2eGoogleEventSyncLink } from "./fixtures/google-calendar-events";
import { enterPreviewAdmin } from "./helpers/admin";
import { calendarImportDashboardLink, expectCalendarImportInDynamo } from "./helpers/calendar-import";
import { expectJobGoogleEventInDynamo, reseedE2eTable } from "./helpers/dynamo";
import { setE2eCalendarFixtures } from "./helpers/calendar-sync";

test.describe("Gmail sync link", () => {
  test.beforeEach(() => {
    reseedE2eTable();
  });

  test("links pending Gmail import to existing hub cleaning", async ({ page, request }) => {
    await setE2eCalendarFixtures(request, [e2eGoogleEventSyncLink(e2eCalendarSyncLinkDate)]);
    await enterPreviewAdmin(page);
    const importCard = page.locator("section, div").filter({
      has: calendarImportDashboardLink(page, E2E.calImportSyncLink),
    });
    await expect(calendarImportDashboardLink(page, E2E.calImportSyncLink)).toBeVisible({ timeout: 60_000 });
    await expect(importCard.getByText("Already on schedule")).toBeVisible({ timeout: 60_000 });
    await importCard.getByRole("button", { name: "Link to Hub cleaning" }).click();
    await expect(page.getByText(/linked|Linked/i)).toBeVisible({ timeout: 60_000 });
    await expectJobGoogleEventInDynamo(E2E.jobSyncLinkTarget, E2E.gcalEventSyncLink);
    await expectCalendarImportInDynamo(E2E.calImportSyncLink, {
      status: "APPROVED",
      approvedJobId: E2E.jobSyncLinkTarget,
      googleCalendarEventId: E2E.gcalEventSyncLink,
    });
  });
});
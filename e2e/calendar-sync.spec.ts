import { test, expect } from "./fixtures/test";
import { E2E } from "./fixtures/ids";
import {
  e2eCalendarImportApproveDate,
  e2eCalendarSyncRecreateDate,
} from "./fixtures/job-date";
import {
  e2eBaselineSyncFeed,
  e2eGoogleEventSyncLive,
  e2eGoogleEventSyncNew,
  e2eGoogleEventSyncWithdraw,
} from "./fixtures/google-calendar-events";
import { enterPreviewAdmin } from "./helpers/admin";
import { expectCalendarImportInDynamo } from "./helpers/calendar-import";
import {
  expectJobGoogleEventInDynamo,
  expectJobStatusInDynamo,
  reseedE2eTable,
} from "./helpers/dynamo";
import { runE2eCalendarSync, setE2eCalendarFixtures } from "./helpers/calendar-sync";

test.describe("Gmail calendar sync", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(() => {
    reseedE2eTable();
  });

  test("keeps linked cleaning when live Google event is in the feed", async ({ request }) => {
    const events = e2eBaselineSyncFeed(e2eCalendarSyncRecreateDate);
    const result = await runE2eCalendarSync(request, events);
    expect(result.jobsCanceled ?? 0).toBe(0);
    await expectJobStatusInDynamo(E2E.jobSyncLinked, "SCHEDULED");
    await expectJobGoogleEventInDynamo(E2E.jobSyncLinked, E2E.gcalEventSyncLive);
  });

  test("supersedes withdrawn ghost rows when live approved import syncs", async ({ request }) => {
    await runE2eCalendarSync(request, e2eBaselineSyncFeed(e2eCalendarSyncRecreateDate));
    await expectCalendarImportInDynamo(E2E.calImportSyncGhost, {
      status: "REJECTED",
      rejectedReason: "Superseded by live Gmail link",
    });
    await expectCalendarImportInDynamo(E2E.calImportSyncGhostBad, {
      status: "REJECTED",
    });
  });

  test("does not cancel cleaning when stale import id is absent but job points at live event", async ({
    request,
  }) => {
    const events = e2eBaselineSyncFeed(e2eCalendarSyncRecreateDate);
    const result = await runE2eCalendarSync(request, events);
    expect(result.jobsCanceled ?? 0).toBe(0);
    await expectJobStatusInDynamo(E2E.jobSyncLinked, "SCHEDULED");
    await expectCalendarImportInDynamo(E2E.calImportSyncStaleApproved, { status: "WITHDRAWN" });
    await runE2eCalendarSync(request, events);
    await expectJobStatusInDynamo(E2E.jobSyncLinked, "SCHEDULED");
  });

  test("withdraws approved import missing from Google feed", async ({ request }) => {
    await runE2eCalendarSync(request, [e2eGoogleEventSyncLive(e2eCalendarSyncRecreateDate)]);
    await expectCalendarImportInDynamo(E2E.calImportSyncWithdraw, { status: "CALENDAR_CANCELED" });
    await expectJobStatusInDynamo(E2E.jobSyncWithdraw, "CANCELED");
    await expectCalendarImportInDynamo(E2E.calImportPortlandApprove, { status: "PENDING_REVIEW" });
  });

  test("creates pending import for new Google event", async ({ request, page }) => {
    await runE2eCalendarSync(request, [
      ...e2eBaselineSyncFeed(e2eCalendarSyncRecreateDate),
      e2eGoogleEventSyncNew(e2eCalendarImportApproveDate),
    ]);
    await enterPreviewAdmin(page);
    await page.reload();
    await expect(page.getByRole("link", { name: /E2E Sync New/i })).toBeVisible({ timeout: 60_000 });
    await expectCalendarImportInDynamo(E2E.calImportSyncNew, { status: "PENDING_REVIEW" });
  });

});
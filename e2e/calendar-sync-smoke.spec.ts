import { test, expect } from "./fixtures/test";
import { E2E } from "./fixtures/ids";
import { e2eCalendarSyncRecreateDate } from "./fixtures/job-date";
import { e2eBaselineSyncFeed } from "./fixtures/google-calendar-events";
import { enterPreviewAdmin } from "./helpers/admin";
import { expectJobStatusInDynamo, reseedE2eTable } from "./helpers/dynamo";
import { runCheckGmailOnDashboard, setE2eCalendarFixtures } from "./helpers/calendar-sync";

test.describe("Check Gmail smoke", () => {
  test.beforeEach(() => {
    reseedE2eTable();
  });

  test("Check Gmail uses E2E calendar fixtures and preserves linked cleaning", async ({ page, request }) => {
    const events = e2eBaselineSyncFeed(e2eCalendarSyncRecreateDate);
    await setE2eCalendarFixtures(request, events);
    await enterPreviewAdmin(page);
    await runCheckGmailOnDashboard(page);
    await expectJobStatusInDynamo(E2E.jobSyncLinked, "SCHEDULED");
  });
});
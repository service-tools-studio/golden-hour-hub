import { test } from "./fixtures/test";
import { E2E } from "./fixtures/ids";
import { enterPreviewCleaner, inviteCleanerOnJob, directlyAssignCleanerOnJob } from "./helpers/admin";
import { bookPortlandCleaning } from "./helpers/booking";
import {
  acceptCleanerInvitation,
  declineCleanerInvitation,
  expectCleanerInvitationAbsentForJob,
  expectCleanerInvitationForJob,
  expectCleanerUpcomingJob,
} from "./helpers/cleaner";
import { expectJobAssignmentInDynamo } from "./helpers/dynamo";

/** One job per test; each targets Ada's card via `data-job-id` + address, not “any E2E invite”. */
test.describe.configure({ mode: "serial" });

test.describe("cleaner staffing after booking", () => {
  test("invite shows on cleaner dashboard", async ({ page }) => {
    const booking = await bookPortlandCleaning(page, "Invite");
    await inviteCleanerOnJob(
      page,
      booking.jobId,
      E2E.cleanerPortland,
      E2E.labels.portlandCleaner,
      booking.arrivalStart,
    );
    await expectJobAssignmentInDynamo(booking.jobId, E2E.cleanerPortland, "INVITED");

    await enterPreviewCleaner(page, E2E.labels.portlandCleaner);
    await expectCleanerInvitationForJob(page, booking);
  });

  test("cleaner can decline invitation", async ({ page }) => {
    const booking = await bookPortlandCleaning(page, "Decline");
    await inviteCleanerOnJob(
      page,
      booking.jobId,
      E2E.cleanerPortland,
      E2E.labels.portlandCleaner,
      booking.arrivalStart,
    );
    await expectJobAssignmentInDynamo(booking.jobId, E2E.cleanerPortland, "INVITED");

    await enterPreviewCleaner(page, E2E.labels.portlandCleaner);
    await expectCleanerInvitationForJob(page, booking);
    await declineCleanerInvitation(page, booking);
    await expectJobAssignmentInDynamo(booking.jobId, E2E.cleanerPortland, "DECLINED");
  });

  test("cleaner can accept invitation", async ({ page }) => {
    const booking = await bookPortlandCleaning(page, "Accept");
    await inviteCleanerOnJob(
      page,
      booking.jobId,
      E2E.cleanerPortland,
      E2E.labels.portlandCleaner,
      booking.arrivalStart,
    );
    await expectJobAssignmentInDynamo(booking.jobId, E2E.cleanerPortland, "INVITED");

    await enterPreviewCleaner(page, E2E.labels.portlandCleaner);
    await expectCleanerInvitationForJob(page, booking);
    await acceptCleanerInvitation(page, booking);
    await expectCleanerUpcomingJob(page, booking);
    await expectJobAssignmentInDynamo(booking.jobId, E2E.cleanerPortland, "CONFIRMED");
  });

  test("assign directly shows on cleaner dashboard", async ({ page }) => {
    const booking = await bookPortlandCleaning(page, "Direct");
    await directlyAssignCleanerOnJob(
      page,
      booking.jobId,
      E2E.cleanerPortland,
      E2E.labels.portlandCleaner,
      booking.arrivalStart,
    );
    await expectJobAssignmentInDynamo(booking.jobId, E2E.cleanerPortland, "CONFIRMED");

    await enterPreviewCleaner(page, E2E.labels.portlandCleaner);
    await expectCleanerInvitationAbsentForJob(page, booking.jobId);
    await expectCleanerUpcomingJob(page, booking);
  });
});

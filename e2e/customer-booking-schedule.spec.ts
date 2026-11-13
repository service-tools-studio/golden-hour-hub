import { test, expect } from "./fixtures/test";
import { e2eFutureJobDate } from "./fixtures/job-date";
import {
  chooseMarketTab,
  enterPreviewAdmin,
  expectJobDetailLoadedFromDynamo,
  openAdminScheduleViaNav,
  openScheduleDayFromMonthView,
  pickCustomerOnNewJob,
  saveNewCleaning,
  waitForNewJobProperty,
} from "./helpers/admin";
import { fillNewCustomerProperty, saveCustomerFormAndOpenDetail } from "./helpers/customer";
import { expectCustomerPersistedInDynamo, expectJobPersistedInDynamo, waitForSavedCustomerId } from "./helpers/dynamo";

test.describe("customer → book cleaning → schedule", () => {
  test("new customer appears in search, booking shows on schedule day", async ({ page }) => {
    const lastName = `Schedule${Date.now()}`;
    const displayName = `E2E ${lastName}`;
    const phoneSuffix = String(Date.now()).slice(-4);
    const cleaningDate = e2eFutureJobDate;
    const street = "880 Booking Flow Blvd";

    await enterPreviewAdmin(page);

    await page.goto("/admin/customers/new");
    await fillNewCustomerProperty(page, {
      firstName: "E2E",
      lastName,
      phone: `503555${phoneSuffix}`,
      street,
      zip: "97201",
      market: "Portland",
    });
    await saveCustomerFormAndOpenDetail(page);
    const customerId = await waitForSavedCustomerId(page);
    await expectCustomerPersistedInDynamo(customerId, { lastName, marketId: "portland" });

    await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Customers" }).click();
    await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
    await page.getByLabel("Search customers").fill(displayName);
    await expect(page.getByRole("link", { name: new RegExp(lastName) })).toBeVisible();

    await page.goto(`/admin/jobs/new?date=${cleaningDate}`);
    await expect(page.getByRole("heading", { name: "New cleaning" })).toBeVisible();
    await pickCustomerOnNewJob(page, displayName, new RegExp(lastName));
    await waitForNewJobProperty(page, street);
    const jobId = await saveNewCleaning(page);

    await expectJobPersistedInDynamo(jobId, { date: cleaningDate, customerLastName: lastName });
    await expectJobDetailLoadedFromDynamo(page, jobId, displayName);

    await openAdminScheduleViaNav(page);
    await chooseMarketTab(page, "All");
    await openScheduleDayFromMonthView(page, cleaningDate);
    const scheduleJobLink = page.locator(`a[href="/admin/jobs/${jobId}?from=schedule"]`);
    await expect(scheduleJobLink).toBeVisible({ timeout: 60_000 });
    await expect(scheduleJobLink.getByText(new RegExp(lastName))).toBeVisible();
  });
});

import { test, expect } from "./fixtures/test";
import { E2E } from "./fixtures/ids";
import { e2eJobDate } from "./fixtures/job-date";
import { enterPreviewAdmin, switchCustomerOnNewJob, waitForNewJobProperty } from "./helpers/admin";
import { expectSeedJobSnapshotInDynamo } from "./helpers/dynamo";

test.describe("book cleaning roster", () => {
  test("available cleaners follow property market", async ({ page }) => {
    await enterPreviewAdmin(page);
    await page.goto(`/admin/jobs/new?customerId=${E2E.customerPhoenix}&date=${e2eJobDate}`);
    await expect(page.getByRole("heading", { name: "New cleaning" })).toBeVisible();
    await waitForNewJobProperty(page);
    await expect(page.getByText("Available cleaners")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /^Rio\b/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Ada\b/ })).toHaveCount(0);

    await switchCustomerOnNewJob(page, "E2E Portland", /E2E Portland/);
    await expect(page.getByRole("button", { name: /^Ada\b/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Rio\b/ })).toHaveCount(0);
    await expectSeedJobSnapshotInDynamo(E2E.jobPhoenix, { customerDisplaySubstring: "Phoenix", marketId: "phoenix" });
    await expectSeedJobSnapshotInDynamo(E2E.jobPortland, { customerDisplaySubstring: "Portland", marketId: "portland" });
  });

  test("switching property market clears other-market draft selection", async ({ page }) => {
    await enterPreviewAdmin(page);
    await page.goto(`/admin/jobs/new?customerId=${E2E.customerPhoenix}&date=${e2eJobDate}`);
    await waitForNewJobProperty(page);
    await expect(page.getByText("Available cleaners")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /^Rio\b/ }).click();
    await expect(page.getByText("Selected cleaners")).toBeVisible();
    await switchCustomerOnNewJob(page, "E2E Portland", /E2E Portland/);
    await expect(page.getByText("Selected cleaners")).toHaveCount(0);
    await expectSeedJobSnapshotInDynamo(E2E.jobPhoenix, { customerDisplaySubstring: "Phoenix", marketId: "phoenix" });
  });
});

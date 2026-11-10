import { test, expect } from "@playwright/test";
import { E2E } from "./fixtures/ids";
import { enterPreviewAdmin } from "./helpers/admin";

test.describe("assign cleaner persists", () => {
  test("adding Rio on a Phoenix draft saves to Dynamo", async ({ page }) => {
    await enterPreviewAdmin(page);
    await page.goto(`/admin/jobs/${E2E.jobPhoenixAssign}/cleaners?from=dashboard`);
    await page.locator(`[data-job-cleaner-id="${E2E.cleanerPhoenix}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/admin/jobs/${E2E.jobPhoenixAssign}/edit`));
    await expect(page.getByRole("heading", { name: E2E.labels.phoenixCleaner })).toBeVisible();

    await page.goto(`/admin/jobs/${E2E.jobPhoenixAssign}`);
    await expect(page.getByText(E2E.labels.phoenixCleaner)).toBeVisible();
  });
});

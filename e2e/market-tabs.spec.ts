import { test, expect } from "@playwright/test";
import { E2E } from "./fixtures/ids";
import { chooseMarketTab, enterPreviewAdmin } from "./helpers/admin";

test.describe("admin market tabs", () => {
  test.beforeEach(async ({ page }) => {
    await enterPreviewAdmin(page);
  });

  test("Phoenix tab hides Portland jobs", async ({ page }) => {
    const phoenixJob = page.locator(`a[href="/admin/jobs/${E2E.jobPhoenix}?from=dashboard"]`);
    const portlandJob = page.locator(`a[href="/admin/jobs/${E2E.jobPortland}?from=dashboard"]`);

    await chooseMarketTab(page, "All");
    await expect(phoenixJob).toBeVisible();
    await expect(portlandJob).toBeVisible();

    await chooseMarketTab(page, "Phoenix");
    await expect(phoenixJob).toBeVisible();
    await expect(portlandJob).toHaveCount(0);

    await chooseMarketTab(page, "Portland");
    await expect(portlandJob).toBeVisible();
    await expect(phoenixJob).toHaveCount(0);
  });
});

import { test, expect } from "@playwright/test";
import { E2E } from "./fixtures/ids";
import { chooseMarketTab, enterPreviewAdmin } from "./helpers/admin";

test.describe("schedule market filter", () => {
  test.beforeEach(async ({ page }) => {
    await enterPreviewAdmin(page);
    await page.goto("/admin/schedule");
    await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible();
    await page.getByRole("button", { name: "Search cleanings" }).click();
    await page.getByRole("textbox", { name: "Search cleanings" }).fill("E2E");
  });

  test("Phoenix tab hides Portland cleanings", async ({ page }) => {
    const phoenixJob = page.locator(`a[href="/admin/jobs/${E2E.jobPhoenix}?from=schedule"]`);
    const portlandJob = page.locator(`a[href="/admin/jobs/${E2E.jobPortland}?from=schedule"]`);

    await chooseMarketTab(page, "All");
    await expect(phoenixJob).toBeVisible();
    await expect(portlandJob).toBeVisible();

    await chooseMarketTab(page, "Phoenix");
    await expect(phoenixJob).toBeVisible();
    await expect(portlandJob).toHaveCount(0);
  });
});

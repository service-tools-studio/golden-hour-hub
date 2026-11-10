import { test, expect } from "@playwright/test";
import { E2E } from "./fixtures/ids";
import { enterPreviewAdmin } from "./helpers/admin";

test.describe("cross-market add cleaner", () => {
  test("Phoenix job lists Phoenix cleaner only", async ({ page }) => {
    await enterPreviewAdmin(page);
    await page.goto(`/admin/jobs/${E2E.jobPhoenix}/cleaners?from=dashboard`);
    await expect(page.getByRole("heading", { name: "Add cleaner" })).toBeVisible();
    await expect(page.locator(`[data-job-cleaner-id="${E2E.cleanerPhoenix}"]`)).toBeVisible();
    await expect(page.locator(`[data-job-cleaner-id="${E2E.cleanerPortland}"]`)).toHaveCount(0);
  });

  test("Portland job lists Portland cleaner only", async ({ page }) => {
    await enterPreviewAdmin(page);
    await page.goto(`/admin/jobs/${E2E.jobPortland}/cleaners?from=dashboard`);
    await expect(page.getByRole("heading", { name: "Add cleaner" })).toBeVisible();
    await expect(page.locator(`[data-job-cleaner-id="${E2E.cleanerPortland}"]`)).toBeVisible();
    await expect(page.locator(`[data-job-cleaner-id="${E2E.cleanerPhoenix}"]`)).toHaveCount(0);
  });
});

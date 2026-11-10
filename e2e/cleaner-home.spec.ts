import { test, expect } from "@playwright/test";
import { E2E } from "./fixtures/ids";
import { enterPreviewCleaner } from "./helpers/admin";

test.describe("cleaner preview", () => {
  test("Portland cleaner loads home", async ({ page }) => {
    await enterPreviewCleaner(page, E2E.labels.portlandCleaner);
    await expect(page.getByRole("link", { name: "Schedule" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Availability", exact: true })).toBeVisible();
  });
});

import { test, expect } from "@playwright/test";
import { enterPreviewAdmin } from "./helpers/admin";

test.describe("admin smoke", () => {
  test("preview admin dashboard and nav", async ({ page }) => {
    await enterPreviewAdmin(page);
    await expect(page.getByRole("tab", { name: "Portland" })).toBeVisible();
    await page.getByRole("link", { name: "Schedule" }).click();
    await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible();
    await page.getByRole("link", { name: "Team" }).click();
    await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
  });
});

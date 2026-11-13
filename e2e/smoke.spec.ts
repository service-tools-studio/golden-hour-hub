import { test, expect } from "./fixtures/test";
import { enterPreviewAdmin } from "./helpers/admin";

test.describe("admin smoke", () => {
  test("preview admin dashboard and nav", async ({ page }) => {
    await enterPreviewAdmin(page);
    await expect(page.getByRole("tab", { name: "Portland" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Phoenix" })).toBeVisible();
    await page.locator("nav.fixed").getByRole("link", { name: "Schedule", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible();
    await page.locator("nav.fixed").getByRole("link", { name: "Team", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
  });
});

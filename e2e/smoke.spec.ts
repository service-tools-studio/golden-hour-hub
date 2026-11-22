import { test, expect } from "./fixtures/test";
import { enterPreviewAdmin } from "./helpers/admin";

test.describe("admin smoke", () => {
  test("preview admin dashboard and nav", async ({ page }) => {
    await enterPreviewAdmin(page);
    await expect(page.getByRole("tab", { name: "Portland" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Phoenix" })).toBeVisible();
    await expect(page.getByRole("navigation").last().getByRole("link", { name: "Schedule", exact: true })).toBeVisible();
    await page.goto("/admin/schedule");
    await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible();
    await page.goto("/admin/team");
    await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
  });
});

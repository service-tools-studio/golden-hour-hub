import { test, expect } from "@playwright/test";
import { E2E } from "./fixtures/ids";
import { chooseMarketTab, enterPreviewAdmin } from "./helpers/admin";

test.describe("team market", () => {
  test("filters cleaners by market tab", async ({ page }) => {
    await enterPreviewAdmin(page);
    await page.goto("/admin/team");
    await chooseMarketTab(page, "Phoenix");
    await expect(page.getByRole("link", { name: new RegExp(E2E.labels.phoenixCleaner) })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(E2E.labels.portlandCleaner) })).toHaveCount(0);
  });

  test("add-cleaner form shows market radios synced from viewing market", async ({ page }) => {
    await enterPreviewAdmin(page);
    await page.goto("/admin/team");
    await chooseMarketTab(page, "Phoenix");
    await page.getByRole("link", { name: "+ Add cleaner" }).click();
    await expect(page.getByRole("radio", { name: "Phoenix" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("radio", { name: "Portland" }).click();
    await expect(page.getByRole("radio", { name: "Portland" })).toHaveAttribute("aria-checked", "true");
  });
});

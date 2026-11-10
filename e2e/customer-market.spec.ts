import { test, expect } from "@playwright/test";
import {
  expectMarketValidation,
  fillNewCustomerProperty,
  saveCustomerForm,
} from "./helpers/customer";
import { enterPreviewAdmin } from "./helpers/admin";

test.describe("customer property market", () => {
  test("requires Portland or Phoenix before save", async ({ page }) => {
    await enterPreviewAdmin(page);
    await page.goto("/admin/customers/new");
    await fillNewCustomerProperty(page, {
      firstName: "E2E",
      lastName: "NeedsMarket",
      phone: "5035550998",
      street: "900 Validation Ave",
      zip: "97201",
    });
    await saveCustomerForm(page);
    await expectMarketValidation(page);
  });

  test("saves customer with market and reopens with market set", async ({ page }) => {
    const lastName = `Roundtrip${Date.now()}`;
    await enterPreviewAdmin(page);
    await page.goto("/admin/customers/new");
    await fillNewCustomerProperty(page, {
      firstName: "E2E",
      lastName,
      phone: "5035550997",
      street: "901 Roundtrip St",
      zip: "97201",
      market: "Portland",
    });
    await saveCustomerForm(page);
    await expect(page).toHaveURL(/\/admin\/customers\/.+/);
    await page.getByText("Tap to edit").click();
    await expect(page.getByRole("radio", { name: "Portland" })).toHaveAttribute("aria-checked", "true");
  });

  test("appears in customer search after save", async ({ page }) => {
    const lastName = `Search${Date.now()}`;
    await enterPreviewAdmin(page);
    await page.goto("/admin/customers/new");
    await fillNewCustomerProperty(page, {
      firstName: "E2E",
      lastName,
      phone: "5035550996",
      street: "902 Search Ln",
      zip: "97201",
      market: "Phoenix",
    });
    await saveCustomerForm(page);
    await expect(page).toHaveURL(/\/admin\/customers\/.+/);
    await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Customers" }).click();
    await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
    await page.getByLabel("Search customers").fill(`E2E ${lastName}`);
    await expect(page.getByRole("link", { name: new RegExp(lastName) })).toBeVisible();
  });
});

import { expect, type Page } from "@playwright/test";

export async function fillNewCustomerProperty(
  page: Page,
  options: {
    firstName: string;
    lastName: string;
    phone: string;
    street: string;
    zip: string;
    market?: "Portland" | "Phoenix";
    squareFeet?: string;
  },
): Promise<void> {
  await page.getByLabel("First name").fill(options.firstName);
  await page.getByLabel("Last name").fill(options.lastName);
  await page.getByLabel("Phone").fill(options.phone);
  await page.getByLabel("Street", { exact: true }).fill(options.street);
  await page.getByLabel("ZIP", { exact: true }).fill(options.zip);
  await page.getByRole("textbox", { name: "Beds" }).fill("2");
  await page.getByRole("textbox", { name: "Baths" }).fill("1");
  await page.getByRole("textbox", { name: "Sq ft" }).fill(options.squareFeet ?? "1200");
  if (options.market) {
    await page
      .getByRole("radio", { name: options.market })
      .click();
  }
}

export async function saveCustomerForm(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Save customer" }).click();
}

/** After a successful save the app navigates off `/admin/customers/new`. */
export async function saveCustomerFormAndOpenDetail(page: Page): Promise<void> {
  await Promise.all([
    page.waitForURL(
      (url) => {
        const match = /^\/admin\/customers\/([^/]+)$/.exec(url.pathname);
        return Boolean(match && match[1] !== "new");
      },
      { timeout: 60_000 },
    ),
    page.getByRole("button", { name: "Save customer" }).click(),
  ]);
}

export async function expectMarketValidation(page: Page): Promise<void> {
  await expect(page.getByText("Choose Portland or Phoenix.")).toBeVisible();
}

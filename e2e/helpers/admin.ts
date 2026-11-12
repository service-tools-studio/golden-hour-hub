import { expect, type Page } from "@playwright/test";

export async function enterPreviewAdmin(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Admin" })).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Admin" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 60_000 });
}

export async function chooseMarketTab(page: Page, market: "Portland" | "Phoenix" | "All"): Promise<void> {
  await page.getByRole("tab", { name: market }).click();
}

export async function enterPreviewCleaner(page: Page, cleanerLabel: string): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("button", { name: new RegExp(cleanerLabel) })).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: new RegExp(cleanerLabel) }).click();
  await expect(page.getByRole("heading", { name: /What up,/ })).toBeVisible({ timeout: 60_000 });
}

export async function pickCustomerOnNewJob(page: Page, query: string, displayName: RegExp | string): Promise<void> {
  await page.getByLabel("Customer name").fill(query);
  await page.getByRole("listbox").getByRole("button", { name: displayName }).click();
}

export async function switchCustomerOnNewJob(
  page: Page,
  query: string,
  displayName: RegExp | string,
): Promise<void> {
  await page.getByRole("button", { name: "Remove customer from this cleaning" }).click();
  await pickCustomerOnNewJob(page, query, displayName);
}

/** Wait until the booking form has a property (hub bootstrap + customer prefill). */
export async function waitForNewJobProperty(page: Page): Promise<void> {
  await expect(page.getByText(/E2E (Blvd|St),/)).toBeVisible({ timeout: 60_000 });
}

/** Optional — rosters show availability from start time alone when duration is unset. */
export async function pickEstimatedCleaningDuration(page: Page, label = "3 hours"): Promise<void> {
  const field = page.locator("label").filter({ hasText: /Estimated duration/ });
  await field.getByRole("button").click();
  await page.getByRole("dialog", { name: "Estimated cleaning time" }).getByRole("option", { name: label }).click();
}

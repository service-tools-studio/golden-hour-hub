import { expect, type Page } from "@playwright/test";
import { waitForSavedJobId } from "./dynamo";

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
  const cleanerButton = page.getByRole("button", { name: new RegExp(cleanerLabel) });
  const homeHeading = page.getByRole("heading", { name: /What up,/ });
  const cleanerRoleGate = page.getByText("This area is for cleaners.");

  await page.goto("/");
  await expect(cleanerButton).toBeVisible({ timeout: 120_000 });
  await cleanerButton.click();
  await page.waitForURL(/\/cleaner/, { timeout: 60_000 });

  if (await cleanerRoleGate.isVisible().catch(() => false)) {
    await page.getByRole("link", { name: "Back home" }).click();
    await expect(cleanerButton).toBeVisible({ timeout: 60_000 });
    await cleanerButton.click();
    await page.waitForURL(/\/cleaner/, { timeout: 60_000 });
  }

  if (!(await homeHeading.isVisible().catch(() => false))) {
    await page.goto("/cleaner");
  }
  await expect(homeHeading).toBeVisible({ timeout: 60_000 });
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

/**
 * Wait until a customer is selected and their property line is shown.
 * Seeded e2e customers use "E2E St" / "E2E Blvd"; pass `addressPattern` for ad-hoc customers.
 */
export async function waitForNewJobProperty(
  page: Page,
  addressPattern: string | RegExp = /E2E (Blvd|St),/,
): Promise<void> {
  await expect(page.getByRole("button", { name: "Remove customer from this cleaning" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(addressPattern)).toBeVisible({ timeout: 60_000 });
}

/** Optional — rosters show availability from start time alone when duration is unset. */
export async function pickEstimatedCleaningDuration(page: Page, label = "3 hours"): Promise<void> {
  const field = page.locator("label").filter({ hasText: /Estimated duration/ });
  await field.getByRole("button").click();
  await page.getByRole("dialog", { name: "Estimated cleaning time" }).getByRole("option", { name: label }).click();
}

export async function saveNewCleaning(page: Page): Promise<string> {
  await Promise.all([
    page.waitForURL(
      (url) => {
        const match = /^\/admin\/jobs\/([^/]+)$/.exec(url.pathname);
        return Boolean(match && match[1] !== "new");
      },
      { timeout: 60_000 },
    ),
    page.getByRole("button", { name: "Save cleaning" }).click(),
  ]);
  return waitForSavedJobId(page);
}

/** Bottom nav — keeps hub client state (avoids missing jobs after a hard schedule reload). */
export async function openAdminScheduleViaNav(page: Page): Promise<void> {
  await page.locator("nav.fixed").getByRole("link", { name: "Schedule", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible();
}

/** Month view → day agenda for a service date. */
export async function openScheduleDayFromMonthView(page: Page, date: string): Promise<void> {
  const monthKey = date.slice(0, 7);
  const dayNum = Number(date.slice(8, 10));
  const section = page.locator(`section[data-month="${monthKey}"]`);
  await section.scrollIntoViewIfNeeded();
  await section.getByRole("button", { name: String(dayNum), exact: true }).click();
}

/** Hard navigation — job must be loaded from Dynamo (ensureHubJob / loadJobPartitionAction). */
export async function expectJobDetailLoadedFromDynamo(
  page: Page,
  jobId: string,
  customerLabel: string | RegExp,
): Promise<void> {
  await page.goto(`/admin/jobs/${jobId}`);
  const name = customerLabel instanceof RegExp ? customerLabel : new RegExp(`^${escapeRegex(customerLabel)}$`);
  await expect(
    page.locator('a[href^="/admin/customers/"]').filter({ hasText: name }),
  ).toBeVisible({ timeout: 60_000 });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Matches assignment pay inputs (hourly default — not "Total pay per job"). */
const assignmentPayInput = () =>
  'input[aria-label="Pay per hour"], input[aria-label="Total pay per job"], input[aria-label="Crew pay per hour"], input[aria-label="Crew total pay per job"]';

function onJobDetailPage(url: string, jobId: string): boolean {
  try {
    return new RegExp(`^/admin/jobs/${escapeRegex(jobId)}$`).test(new URL(url).pathname);
  } catch {
    return false;
  }
}

async function waitForJobDetailReady(page: Page, jobId: string): Promise<void> {
  if (!onJobDetailPage(page.url(), jobId)) {
    await page.goto(`/admin/jobs/${jobId}`);
  }
  const loading = page.getByText("Loading cleaning…");
  if (await loading.isVisible().catch(() => false)) {
    await expect(loading).not.toBeVisible({ timeout: 60_000 });
  }
  if (await page.getByText("That cleaning could not be found.").isVisible().catch(() => false)) {
    throw new Error(`Job ${jobId} did not load on admin job detail (check Dynamo / ensureHubJob).`);
  }
  await expect(page.getByRole("link", { name: "Add cleaner" })).toBeVisible({ timeout: 60_000 });
}

/** Job detail first so `ensureHubJob` runs before staffing (new jobs are not in the bootstrap snapshot). */
export async function openJobCleanerRoster(page: Page, jobId: string): Promise<void> {
  await waitForJobDetailReady(page, jobId);
  const addCleaner = page.getByRole("link", { name: "Add cleaner" });
  await Promise.all([
    page.waitForURL(new RegExp(`/admin/jobs/${escapeRegex(jobId)}/cleaners`), { timeout: 60_000 }),
    addCleaner.click(),
  ]);
  await expect(page.getByRole("heading", { name: "Add cleaner" })).toBeVisible();
}

export async function pickCleanerOnJobRoster(page: Page, cleanerId: string): Promise<void> {
  const addButton = page.locator(`[data-job-cleaner-id="${cleanerId}"]`);
  await expect(addButton).toBeVisible({ timeout: 60_000 });
  await expect(addButton).toHaveAttribute("data-job-cleaner-loading", "0", { timeout: 60_000 });
  await Promise.all([
    page.waitForURL(/\/edit/, { timeout: 60_000 }),
    addButton.click(),
  ]);
  await expect(page.locator(assignmentPayInput())).toBeVisible({ timeout: 60_000 });
}

/** Pre-filled from cleaner hourly rate when possible; override when blank or too low. */
export async function fillJobAssignmentPay(page: Page, amount = "350"): Promise<void> {
  const payField = page.locator(assignmentPayInput()).first();
  await expect(payField).toBeVisible({ timeout: 60_000 });
  const current = (await payField.inputValue()).trim();
  if (!current || Number(current) < 50) {
    await payField.fill(amount);
  }
}

function arrivalClockParts(time24: string): { hour: string; minute: string; suffix: "AM" | "PM" } {
  const [h, m] = time24.split(":").map((part) => Number(part));
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return {
    hour: String(hour12),
    minute: String(m).padStart(2, "0"),
    suffix: h >= 12 ? "PM" : "AM",
  };
}

/** Set a concrete start time on the draft staffing form (24h `HH:MM`). */
export async function setJobAssignmentArrival(page: Page, time24: string): Promise<void> {
  const { hour, minute, suffix } = arrivalClockParts(time24);
  const form = page.locator("form").filter({ has: page.getByText("Draft assignment") });
  const expander = form.locator("button[aria-expanded]").first();
  await expander.click();
  const tbd = form.getByRole("switch");
  if ((await tbd.getAttribute("aria-checked")) === "true") {
    await tbd.click();
  }
  await form.locator('[aria-label="Hour"]').getByRole("button", { name: hour, exact: true }).click();
  await form.locator('[aria-label="Minute"]').getByRole("button", { name: minute, exact: true }).click();
  await form.locator('[aria-label="AM or PM"]').getByRole("button", { name: suffix, exact: true }).click();
  await expander.click();
}

export async function sendJobInvitation(page: Page, jobId: string): Promise<void> {
  await Promise.all([
    page.waitForURL(new RegExp(`/admin/jobs/${escapeRegex(jobId)}(\\?|$)`), { timeout: 60_000 }),
    page.getByRole("button", { name: "Save and send invite" }).click(),
  ]);
}

export async function assignCleanerDirectlyOnJob(page: Page, jobId: string): Promise<void> {
  await Promise.all([
    page.waitForURL(new RegExp(`/admin/jobs/${escapeRegex(jobId)}(\\?|$)`), { timeout: 60_000 }),
    page.getByRole("button", { name: "Assign directly and notify" }).click(),
  ]);
}

export async function inviteCleanerOnJob(
  page: Page,
  jobId: string,
  cleanerId: string,
  cleanerHeading: string,
  arrivalStart?: string,
): Promise<void> {
  await openJobCleanerRoster(page, jobId);
  await pickCleanerOnJobRoster(page, cleanerId);
  await expect(page.getByRole("heading", { name: cleanerHeading })).toBeVisible({ timeout: 60_000 });
  await fillJobAssignmentPay(page);
  if (arrivalStart) await setJobAssignmentArrival(page, arrivalStart);
  await expect(page.getByRole("button", { name: "Save and send invite" })).toBeVisible();
  await sendJobInvitation(page, jobId);
}

export async function directlyAssignCleanerOnJob(
  page: Page,
  jobId: string,
  cleanerId: string,
  cleanerHeading: string,
  arrivalStart?: string,
): Promise<void> {
  await openJobCleanerRoster(page, jobId);
  await pickCleanerOnJobRoster(page, cleanerId);
  await expect(page.getByRole("heading", { name: cleanerHeading })).toBeVisible();
  await fillJobAssignmentPay(page);
  if (arrivalStart) await setJobAssignmentArrival(page, arrivalStart);
  await assignCleanerDirectlyOnJob(page, jobId);
}

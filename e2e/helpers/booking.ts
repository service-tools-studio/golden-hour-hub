import type { Page } from "@playwright/test";
import {
  e2eStaffingArrivalStart,
  e2eStaffingCleaningDate,
  e2eStaffingDayOffsets,
  type E2eStaffingPrefix,
} from "../fixtures/job-date";
import {
  enterPreviewAdmin,
  pickCustomerOnNewJob,
  saveNewCleaning,
  waitForNewJobProperty,
} from "./admin";
import { fillNewCustomerProperty, saveCustomerFormAndOpenDetail } from "./customer";
import { expectCustomerPersistedInDynamo, expectJobPersistedInDynamo, waitForSavedCustomerId } from "./dynamo";

export type PortlandBooking = {
  jobId: string;
  customerId: string;
  displayName: string;
  lastName: string;
  customerFirstName: string;
  cleaningDate: string;
  street: string;
  /** Set for cleaner-staffing prefixes — distinct service date + arrival. */
  arrivalStart?: string;
};

/** Admin: new Portland customer + cleaning on a future date (no schedule assertion). */
export async function bookPortlandCleaning(page: Page, lastNamePrefix: string): Promise<PortlandBooking> {
  const customerFirstName = `E2E${lastNamePrefix}`;
  const lastName = `${lastNamePrefix}${Date.now()}`;
  const displayName = `${customerFirstName} ${lastName}`;
  const phoneSuffix = String(Date.now()).slice(-4);
  const staffingPrefix = lastNamePrefix in e2eStaffingDayOffsets ? (lastNamePrefix as E2eStaffingPrefix) : null;
  const cleaningDate = e2eStaffingCleaningDate(lastNamePrefix);
  const arrivalStart = staffingPrefix ? e2eStaffingArrivalStart[staffingPrefix] : undefined;
  const street = `881 ${lastNamePrefix} Staffing Blvd`;

  await enterPreviewAdmin(page);

  await page.goto("/admin/customers/new");
  await fillNewCustomerProperty(page, {
    firstName: customerFirstName,
    lastName,
    phone: `503555${phoneSuffix}`,
    street,
    zip: "97201",
    market: "Portland",
  });
  await saveCustomerFormAndOpenDetail(page);
  const customerId = await waitForSavedCustomerId(page);
  await expectCustomerPersistedInDynamo(customerId, { lastName, marketId: "portland" });

  await page.goto(`/admin/jobs/new?date=${cleaningDate}`);
  await pickCustomerOnNewJob(page, displayName, new RegExp(lastName));
  await waitForNewJobProperty(page, street);
  const jobId = await saveNewCleaning(page);
  await expectJobPersistedInDynamo(jobId, { date: cleaningDate, customerLastName: lastName });

  return {
    jobId,
    customerId,
    displayName,
    lastName,
    customerFirstName,
    cleaningDate,
    street,
    arrivalStart,
  };
}

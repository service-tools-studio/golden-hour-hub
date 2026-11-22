import { zonedToUtc } from "../../lib/domain/time.ts";
import type { GoogleCalendarEvent } from "../../lib/services/google-calendar-client.ts";
import { e2eCalendarSyncWithdrawDate, e2eCalendarSyncWithdrawQuietDate } from "./job-date";
import { E2E } from "./ids";

const SYNC_LOCATION = "300 E2E Sync Ln, Portland, OR 97207, United States";

function googleEventAt(
  id: string,
  serviceDate: string,
  arrivalTime: string,
  title: string,
  location = SYNC_LOCATION,
): GoogleCalendarEvent {
  const start = zonedToUtc(serviceDate, arrivalTime);
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
  return {
    id,
    status: "confirmed",
    summary: title,
    description: "3 bed\n2 bath\n1,500 sq ft",
    location,
    start: { dateTime: start.toISOString(), timeZone: "America/Los_Angeles" },
    end: { dateTime: end.toISOString(), timeZone: "America/Los_Angeles" },
  };
}

export function e2eGoogleEventSyncLive(serviceDate: string): GoogleCalendarEvent {
  return googleEventAt(E2E.gcalEventSyncLive, serviceDate, "15:00", E2E.labels.syncRecreateCustomer);
}

export function e2eGoogleEventSyncLink(serviceDate: string): GoogleCalendarEvent {
  return googleEventAt(E2E.gcalEventSyncLink, serviceDate, "15:00", E2E.labels.syncRecreateCustomer);
}

export function e2eGoogleEventSyncNew(serviceDate: string): GoogleCalendarEvent {
  return googleEventAt(E2E.gcalEventSyncNew, serviceDate, "11:00", "E2E Sync New");
}

export function e2eGoogleEventSyncWithdraw(
  serviceDate: string = e2eCalendarSyncWithdrawDate,
): GoogleCalendarEvent {
  return googleEventAt(E2E.gcalEventSyncWithdraw, serviceDate, "11:00", "E2E Sync Withdraw");
}

export function e2eGoogleEventSyncWithdrawQuiet(
  serviceDate: string = e2eCalendarSyncWithdrawQuietDate,
): GoogleCalendarEvent {
  return googleEventAt(
    E2E.gcalEventSyncWithdrawQuiet,
    serviceDate,
    "09:00",
    "E2E Withdraw Quiet",
    "400 E2E St, Portland, OR 97208, United States",
  );
}

/** Feed that keeps seeded linked/approved sync jobs from being canceled during unrelated scenarios. */
export function e2eBaselineSyncFeed(syncLiveDate: string): GoogleCalendarEvent[] {
  return [
    e2eGoogleEventSyncLive(syncLiveDate),
    e2eGoogleEventSyncWithdraw(),
    e2eGoogleEventSyncWithdrawQuiet(),
  ];
}

export function e2eGoogleEventPortlandApprove(serviceDate: string): GoogleCalendarEvent {
  return googleEventAt(
    E2E.gcalEventPortlandApprove,
    serviceDate,
    "10:00",
    E2E.labels.portlandCustomer,
    "100 E2E St, Portland, OR 97201",
  );
}
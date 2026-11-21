import {
  calendarImportLinkedJobId,
  calendarImportScheduleMovedFromGoogle,
} from "../domain/calendar-import.ts";
import type { CalendarImport } from "../domain/types.ts";
import type { HubData } from "../mock/seed.ts";
import { rescheduleJobFromCalendarSync } from "./calendar-import-sync-side-effects.ts";

/** Move an approved import's linked hub job when Google event date/time changes. */
export function applyApprovedImportScheduleFromGoogle(
  hub: HubData,
  existing: CalendarImport,
  serviceDate: string,
  arrivalWindowStart: string | undefined,
  arrivalWindowEnd: string | undefined,
): { hub: HubData; jobsRescheduled: number } {
  const scheduleMoved = calendarImportScheduleMovedFromGoogle(
    hub,
    existing,
    serviceDate,
    arrivalWindowStart,
    arrivalWindowEnd,
  );
  if (!scheduleMoved) return { hub, jobsRescheduled: 0 };
  const jobId = calendarImportLinkedJobId(hub, existing);
  if (!jobId) return { hub, jobsRescheduled: 0 };
  const nextHub = rescheduleJobFromCalendarSync(hub, jobId, {
    date: serviceDate,
    arrivalWindowStart,
    arrivalWindowEnd,
  });
  return { hub: nextHub, jobsRescheduled: 1 };
}
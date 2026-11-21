import "server-only";

import { addDays } from "../domain/time.ts";
import type { DynamoItem } from "./items.ts";
import { queryRelationIndex, queryScheduleIndex } from "./dynamo-queries.ts";

function queryCalendarImportsByStatusInRange(
  gsiPk: string,
  startDate: string,
  endDate: string,
): Promise<DynamoItem[]> {
  return queryScheduleIndex(gsiPk, {
    expression: "gsi1sk BETWEEN :start AND :end",
    values: {
      ":start": `${startDate}#`,
      ":end": `${endDate}#\uffff`,
    },
  });
}

export async function queryPendingCalendarImportsInRange(
  startDate: string,
  endDate: string,
): Promise<DynamoItem[]> {
  return queryCalendarImportsByStatusInRange("CAL_IMPORT#PENDING", startDate, endDate);
}

/** Gmail events removed on Google that still need admin follow-up (e.g. cleaner removal texts). */
export async function queryCalendarCanceledImportsInRange(
  startDate: string,
  endDate: string,
): Promise<DynamoItem[]> {
  return queryCalendarImportsByStatusInRange("CAL_IMPORT#CALENDAR_CANCELED", startDate, endDate);
}

export async function queryApprovedCalendarImportsInRange(
  startDate: string,
  endDate: string,
): Promise<DynamoItem[]> {
  return queryCalendarImportsByStatusInRange("CAL_IMPORT#APPROVED", startDate, endDate);
}

export async function queryRejectedCalendarImportsInRange(
  startDate: string,
  endDate: string,
): Promise<DynamoItem[]> {
  return queryCalendarImportsByStatusInRange("CAL_IMPORT#REJECTED", startDate, endDate);
}

export async function queryDashboardCalendarImportsInRange(
  startDate: string,
  endDate: string,
): Promise<DynamoItem[]> {
  const [pending, canceled] = await Promise.all([
    queryPendingCalendarImportsInRange(startDate, endDate),
    queryCalendarCanceledImportsInRange(startDate, endDate),
  ]);
  return [...pending, ...canceled];
}

/** Dismissed / sync-withdrawn imports for dashboard recovery (wider service-date window than pending). */
export async function queryRecentlyDismissedCalendarImportsInRange(
  today: string,
  horizonEnd: string,
  lookbackDays = 14,
): Promise<DynamoItem[]> {
  const start = addDays(today, -lookbackDays);
  const [rejected, withdrawn] = await Promise.all([
    queryRejectedCalendarImportsInRange(start, horizonEnd),
    queryCalendarImportsByStatusInRange("CAL_IMPORT#WITHDRAWN", start, horizonEnd),
  ]);
  return [...rejected, ...withdrawn];
}

/** All import rows sync must consider when matching canceled / missing Google events. */
export async function queryCalendarImportsForSyncInRange(
  startDate: string,
  endDate: string,
): Promise<DynamoItem[]> {
  const [pending, approved, canceled] = await Promise.all([
    queryPendingCalendarImportsInRange(startDate, endDate),
    queryApprovedCalendarImportsInRange(startDate, endDate),
    queryCalendarCanceledImportsInRange(startDate, endDate),
  ]);
  return [...pending, ...approved, ...canceled];
}

export async function findCalendarImportByGoogleEventId(eventId: string): Promise<DynamoItem | null> {
  const id = eventId.trim();
  if (!id) return null;
  const rows = await queryRelationIndex(`GCAL_EVENT#${id}`);
  const match = rows.find((item) => item.entity === "calendar_import");
  return match ?? null;
}
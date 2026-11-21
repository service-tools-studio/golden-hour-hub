import { CALENDAR_IMPORT_HORIZON_DAYS } from "../domain/calendar-import.ts";
import { addDays, todayInBusinessZone, zonedToUtc } from "../domain/time.ts";
import { emptyHub } from "../mock/seed.ts";
import type { HubData } from "../mock/seed.ts";
import {
  googleCalendarImportConfigured,
  listGoogleCalendarEventsInRange,
} from "../services/google-calendar-client.ts";
import { applyCalendarEventsToHub } from "./calendar-import-apply.ts";
import { notifyJasminNewCalendarImports } from "./calendar-import-notify.ts";

export type RunCalendarImportCronOptions = {
  /** Texts JASMIN_PHONE when new import rows are persisted (cron / webhook only; not Check Gmail). */
  notifyJasminOnNewImports?: boolean;
};

export async function runCalendarImportCron(
  hub: HubData = emptyHub(todayInBusinessZone()),
  options: RunCalendarImportCronOptions = {},
): Promise<{
  ran: boolean;
  fetched: number;
  created: number;
  updated: number;
  withdrawn: number;
  jobsCanceled: number;
  jobsRescheduled: number;
  skipped: number;
  message?: string;
}> {
  if (!googleCalendarImportConfigured()) {
    return {
      ran: false,
      fetched: 0,
      created: 0,
      updated: 0,
      withdrawn: 0,
      jobsCanceled: 0,
      jobsRescheduled: 0,
      skipped: 0,
      message: "Calendar import not configured.",
    };
  }

  const today = hub.today || todayInBusinessZone();
  const endDate = addDays(today, CALENDAR_IMPORT_HORIZON_DAYS);
  const timeMinIso = zonedToUtc(today, "00:00").toISOString();
  const timeMaxIso = zonedToUtc(addDays(endDate, 1), "00:00").toISOString();

  let events;
  try {
    events = await listGoogleCalendarEventsInRange({ timeMinIso, timeMaxIso });
  } catch (error) {
    console.error("[cron:calendar-import] list failed", error);
    return {
      ran: false,
      fetched: 0,
      created: 0,
      updated: 0,
      withdrawn: 0,
      jobsCanceled: 0,
      jobsRescheduled: 0,
      skipped: 0,
      message: "Could not list Google Calendar events.",
    };
  }

  const applied = await applyCalendarEventsToHub(hub, events);
  if (applied.message) {
    return {
      ran: false,
      fetched: events.length,
      created: 0,
      updated: 0,
      withdrawn: 0,
      jobsCanceled: 0,
      jobsRescheduled: 0,
      skipped: applied.skipped,
      message: applied.message,
    };
  }

  const notifyJasmin = options.notifyJasminOnNewImports !== false;
  if (notifyJasmin && applied.persisted && applied.created > 0) {
    await notifyJasminNewCalendarImports({
      count: applied.created,
      marketIds: applied.createdMarketIds,
    });
  }

  return {
    ran: true,
    fetched: events.length,
    created: applied.created,
    updated: applied.updated,
    withdrawn: applied.withdrawn,
    jobsCanceled: applied.jobsCanceled,
    jobsRescheduled: applied.jobsRescheduled,
    skipped: applied.skipped,
  };
}
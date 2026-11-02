import { targetAvailabilityWeekForOpenNotice } from "./availability-week-sms-copy.ts";
import { sendAvailabilityWeekSmsToCleaners } from "./availability-week-reminders.ts";
import type { HubData } from "../mock/seed.ts";
import { dayOfWeek, todayInBusinessZone } from "../domain/time.ts";

/** Runs on cron: Monday (business calendar) texts active cleaners who can submit next week. */
export async function runAvailabilityWeekOpenCron(hub: HubData, now = new Date()): Promise<{
  ran: boolean;
  sent: number;
  skipped: number;
  weekStart?: string;
}> {
  const today = todayInBusinessZone(now);
  if (dayOfWeek(today) !== "MONDAY") {
    return { ran: false, sent: 0, skipped: 0 };
  }

  const week = targetAvailabilityWeekForOpenNotice(today);
  const cleanerIds = hub.cleaners.filter((cleaner) => cleaner.status === "ACTIVE").map((cleaner) => cleaner.cleanerId);
  const { sent, skipped } = await sendAvailabilityWeekSmsToCleaners({
    hub: { ...hub, today },
    cleanerIds,
    kind: "week_open_auto",
  });

  return {
    ran: true,
    sent: sent.length,
    skipped: skipped.length,
    weekStart: week.weekStart,
  };
}

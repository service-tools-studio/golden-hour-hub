import { formatWeekRange, nextAvailabilityWeek } from "../domain/time.ts";
import { cleanerHubSmsLink } from "../site-metadata.ts";

/** Same copy as admin “Send Reminder” on Team. */
export function availabilityWeekReminderSmsBody(input: {
  cleanerFirstName: string;
  weekStart: string;
  weekEnd: string;
}): string {
  const link = cleanerHubSmsLink("/cleaner/availability");
  return `Hi ${input.cleanerFirstName}! Golden Hour reminder: please submit your availability for next week (${formatWeekRange(input.weekStart, input.weekEnd)}) by Sunday: ${link}`;
}

export function availabilityWeekOpenSmsBody(input: {
  cleanerFirstName: string;
  weekStart: string;
  weekEnd: string;
}): string {
  const link = cleanerHubSmsLink("/cleaner/availability");
  return `Hi ${input.cleanerFirstName}! Golden Hour Hub: you can now submit your availability for the week of ${formatWeekRange(input.weekStart, input.weekEnd)}. Please submit by Sunday: ${link}`;
}

export function targetAvailabilityWeekForOpenNotice(today: string): { weekStart: string; weekEnd: string } {
  return nextAvailabilityWeek(today);
}

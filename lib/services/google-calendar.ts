export type CalendarEventInput = {
  jobId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  description: string;
};

/**
 * Hub → Google Calendar (Phase 2). Import is implemented separately via calendar import cron.
 * Golden Hour Hub stays the source of truth for staffing; Calendar is a mirror when enabled.
 * Failures must not block scheduling saves.
 */
export async function syncJobToGoogleCalendar(event: CalendarEventInput): Promise<void> {
  if (process.env.GOOGLE_CALENDAR_ENABLED !== "true") return;
  try {
    console.info(`[google-calendar] deferred sync for ${event.jobId}`);
  } catch (error) {
    console.error("[google-calendar] sync failed", error);
  }
}

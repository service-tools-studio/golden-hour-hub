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
 * One-way sync hook. Golden Hour Hub stays the source of truth.
 * Failures must not block scheduling. Live sync is not enabled yet.
 */
export async function syncJobToGoogleCalendar(event: CalendarEventInput): Promise<void> {
  if (process.env.GOOGLE_CALENDAR_ENABLED !== "true") return;
  try {
    console.info(`[google-calendar] deferred sync for ${event.jobId}`);
  } catch (error) {
    console.error("[google-calendar] sync failed", error);
  }
}

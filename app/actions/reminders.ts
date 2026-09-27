"use server";

import { buildSeed } from "@/lib/mock/seed";
import { sendSms } from "@/lib/services/sms";
import { formatWeekRange, nextAvailabilityWeek, todayInBusinessZone } from "@/lib/domain/time";

export async function sendAvailabilityReminders(cleanerIds: string[]): Promise<
  | { ok: true; message: string }
  | { ok: false; message: string }
> {
  try {
    const today = todayInBusinessZone();
    const seed = buildSeed(today);
    const week = nextAvailabilityWeek(today);
    const sent: string[] = [];

    for (const cleanerId of cleanerIds) {
      const cleaner = seed.cleaners.find((item) => item.cleanerId === cleanerId && item.status === "ACTIVE");
      if (!cleaner) continue;
      const submitted = seed.submissions.some(
        (submission) => submission.cleanerId === cleanerId && submission.weekStart === week.weekStart,
      );
      if (submitted) continue;
      const link = process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/cleaner/availability`
        : "Golden Hour Hub";
      await sendSms({
        to: cleaner.mobilePhone,
        body: `Hi ${cleaner.firstName}! Golden Hour reminder: please submit your availability for next week (${formatWeekRange(week.weekStart, week.weekEnd)}) by Sunday: ${link}`,
      });
      sent.push(cleaner.firstName);
    }

    if (sent.length === 0) {
      return { ok: true, message: "No reminders were needed." };
    }
    return {
      ok: true,
      message: `Reminder logged for ${sent.join(" and ")}.`,
    };
  } catch (error) {
    console.error(error);
    return { ok: false, message: "The reminder could not be sent. Please try again." };
  }
}

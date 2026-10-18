"use server";

import { AuthError, requireAdmin } from "@/lib/auth/guards";
import { cleanerAllowsSchedulingSms } from "@/lib/cleaner/sms-consent";
import { dynamoConfigured, loadHub } from "@/lib/data/repository";
import { emptyHub } from "@/lib/mock/seed";
import { SmsDeliveryError, sendSms } from "@/lib/services/sms";
import { formatWeekRange, nextAvailabilityWeek, todayInBusinessZone } from "@/lib/domain/time";
import { cleanerHubAppUrl } from "@/lib/format";

export async function sendAvailabilityReminders(cleanerIds: string[]): Promise<
  | { ok: true; message: string }
  | { ok: false; message: string }
> {
  try {
    await requireAdmin();
    const today = todayInBusinessZone();
    const hub = dynamoConfigured() ? await loadHub() : emptyHub(today);
    const week = nextAvailabilityWeek(today);
    const sent: string[] = [];

    for (const cleanerId of cleanerIds) {
      const cleaner = hub.cleaners.find((item) => item.cleanerId === cleanerId && item.status === "ACTIVE");
      if (!cleaner || !cleanerAllowsSchedulingSms(cleaner)) continue;
      const submitted = hub.submissions.some(
        (submission) => submission.cleanerId === cleanerId && submission.weekStart === week.weekStart,
      );
      if (submitted) continue;
      const link = cleanerHubAppUrl("/cleaner/availability");
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
    if (error instanceof AuthError) return { ok: false, message: error.message };
    const message =
      error instanceof SmsDeliveryError ? error.userMessage : "The reminder could not be sent. Please try again.";
    return { ok: false, message };
  }
}

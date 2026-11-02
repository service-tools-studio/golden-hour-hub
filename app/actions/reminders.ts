"use server";

import { AuthError, requireAdmin } from "@/lib/auth/guards";
import { sendAvailabilityWeekSmsToCleaners } from "@/lib/cleaner/availability-week-reminders";
import { dynamoConfigured, loadHub } from "@/lib/data/repository";
import { emptyHub } from "@/lib/mock/seed";
import { SmsDeliveryError } from "@/lib/services/sms";
import { todayInBusinessZone } from "@/lib/domain/time";

export async function sendAvailabilityReminders(cleanerIds: string[]): Promise<
  | { ok: true; message: string }
  | { ok: false; message: string }
> {
  try {
    await requireAdmin();
    const today = todayInBusinessZone();
    const hub = dynamoConfigured() ? await loadHub() : emptyHub(today);
    const { sent } = await sendAvailabilityWeekSmsToCleaners({
      hub: { ...hub, today },
      cleanerIds,
      kind: "manual_reminder",
    });

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

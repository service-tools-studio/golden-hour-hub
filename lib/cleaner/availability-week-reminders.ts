import {
  availabilityOpenSmsAlreadySent,
  markAvailabilityOpenSmsSent,
} from "../data/availability-open-sms-store.ts";
import { addDays } from "../domain/time.ts";
import type { HubData } from "../mock/seed.ts";
import { SmsDeliveryError, sendSms } from "../services/sms.ts";
import { cleanerAllowsSchedulingSms } from "./sms-consent.ts";
import {
  availabilityWeekOpenSmsBody,
  availabilityWeekReminderSmsBody,
  targetAvailabilityWeekForOpenNotice,
} from "./availability-week-sms-copy.ts";

export type AvailabilityWeekSmsKind = "manual_reminder" | "week_open_auto";

function weekBounds(hub: HubData, weekStart?: string): { weekStart: string; weekEnd: string } {
  const target = targetAvailabilityWeekForOpenNotice(hub.today);
  const start = weekStart?.trim() || target.weekStart;
  const end = start === target.weekStart ? target.weekEnd : addDays(start, 6);
  return { weekStart: start, weekEnd: end };
}

export async function sendAvailabilityWeekSmsToCleaners(input: {
  hub: HubData;
  cleanerIds: string[];
  kind: AvailabilityWeekSmsKind;
  weekStart?: string;
}): Promise<{ sent: string[]; skipped: string[] }> {
  const { weekStart, weekEnd } = weekBounds(input.hub, input.weekStart);
  const sent: string[] = [];
  const skipped: string[] = [];

  for (const cleanerId of input.cleanerIds) {
    const cleaner = input.hub.cleaners.find((item) => item.cleanerId === cleanerId && item.status === "ACTIVE");
    if (!cleaner || !cleanerAllowsSchedulingSms(cleaner)) {
      skipped.push(cleanerId);
      continue;
    }
    const alreadySubmitted = input.hub.submissions.some(
      (submission) => submission.cleanerId === cleanerId && submission.weekStart === weekStart,
    );
    if (alreadySubmitted) {
      skipped.push(cleanerId);
      continue;
    }
    if (input.kind === "week_open_auto" && (await availabilityOpenSmsAlreadySent(weekStart, cleanerId))) {
      skipped.push(cleanerId);
      continue;
    }

    const body =
      input.kind === "week_open_auto"
        ? availabilityWeekOpenSmsBody({ cleanerFirstName: cleaner.firstName, weekStart, weekEnd })
        : availabilityWeekReminderSmsBody({ cleanerFirstName: cleaner.firstName, weekStart, weekEnd });

    try {
      await sendSms({ to: cleaner.mobilePhone, body });
      if (input.kind === "week_open_auto") {
        await markAvailabilityOpenSmsSent({
          weekStart,
          cleanerId,
          sentAt: new Date().toISOString(),
        });
      }
      sent.push(cleaner.firstName);
    } catch (error) {
      const detail = error instanceof SmsDeliveryError ? error.userMessage : error;
      console.error("[availability-week-sms] send failed", { cleanerId, kind: input.kind, detail });
    }
  }

  return { sent, skipped };
}

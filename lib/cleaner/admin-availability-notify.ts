import { adminAvailabilitySubmittedSms } from "./admin-availability-sms.ts";
import { adminNotifyPhoneDigitsFromEnv } from "../contact.ts";
import type { CleanerProfile } from "../domain/types.ts";
import { sendSms, SmsDeliveryError } from "../services/sms.ts";

export async function notifyAdminsCleanerAvailabilitySubmitted(input: {
  cleaner: CleanerProfile;
  weekStart: string;
  kind: "submitted" | "updated";
}): Promise<void> {
  const phones = adminNotifyPhoneDigitsFromEnv();
  if (phones.length === 0) {
    console.warn("[admin:availability] no admin phones (set KELSEY_PHONE and/or JASMIN_PHONE)");
    return;
  }

  const body = adminAvailabilitySubmittedSms({
    cleanerFirstName: input.cleaner.firstName,
    weekStart: input.weekStart,
    kind: input.kind,
  });

  for (const to of phones) {
    try {
      const result = await sendSms({ to, body }, { staff: true });
      console.info("[admin:availability] sent", { to, kind: input.kind, provider: result.provider, confirmed: result.confirmed });
    } catch (error) {
      const detail = error instanceof SmsDeliveryError ? error.userMessage : error;
      console.error("[admin:availability] sms failed", { to, kind: input.kind, detail });
    }
  }
}

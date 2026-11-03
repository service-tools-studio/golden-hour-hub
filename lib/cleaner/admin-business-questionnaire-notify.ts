import { adminBusinessQuestionnaireSubmittedSms } from "./admin-business-questionnaire-sms.ts";
import { jasminNotifyPhoneDigitsFromEnv } from "../contact.ts";
import type { CleanerProfile } from "../domain/types.ts";
import { sendSms, SmsDeliveryError } from "../services/sms.ts";

export async function notifyJasminCleanerBusinessQuestionnaireSubmitted(input: {
  cleaner: CleanerProfile;
  businessDisplayName: string;
  kind: "submitted" | "updated";
}): Promise<void> {
  const to = jasminNotifyPhoneDigitsFromEnv();
  if (!to) {
    console.warn("[admin:business-questionnaire] no JASMIN_PHONE");
    return;
  }

  const body = adminBusinessQuestionnaireSubmittedSms({
    cleanerFirstName: input.cleaner.firstName,
    businessDisplayName: input.businessDisplayName,
    kind: input.kind,
  });

  try {
    const result = await sendSms({ to, body }, { staff: true });
    console.info("[admin:business-questionnaire] sent", {
      to,
      kind: input.kind,
      provider: result.provider,
      confirmed: result.confirmed,
    });
  } catch (error) {
    const detail = error instanceof SmsDeliveryError ? error.userMessage : error;
    console.error("[admin:business-questionnaire] sms failed", { to, kind: input.kind, detail });
  }
}

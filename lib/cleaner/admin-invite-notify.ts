import { adminInviteAcceptedSms } from "./admin-invite-sms.ts";
import { adminNotifyPhoneDigitsFromEnv } from "../contact.ts";
import type { CleanerProfile, Job, JobAssignment } from "../domain/types.ts";
import { cleanerCleaningSmsDetailsFromJob } from "../format.ts";
import { sendSms, SmsDeliveryError } from "../services/sms.ts";

export async function notifyAdminsCleanerAcceptedInvite(input: {
  cleaner: CleanerProfile;
  job: Job;
  assignment: JobAssignment;
}): Promise<void> {
  const phones = adminNotifyPhoneDigitsFromEnv();
  if (phones.length === 0) return;

  const arrivalStart = input.assignment.arrivalWindowStart ?? input.job.arrivalWindowStart;
  const details = cleanerCleaningSmsDetailsFromJob(
    input.job,
    arrivalStart,
    input.assignment.serviceDate,
  );
  const body = adminInviteAcceptedSms({
    cleanerFirstName: input.cleaner.firstName,
    clientFullName: input.job.snapshot.customerDisplayName,
    details,
  });

  for (const to of phones) {
    try {
      await sendSms({ to, body });
    } catch (error) {
      const detail = error instanceof SmsDeliveryError ? error.userMessage : error;
      console.error("[admin:invite-accept] sms failed", { to, detail });
    }
  }
}

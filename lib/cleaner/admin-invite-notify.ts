import { adminInviteAcceptedSms, adminInviteDeclinedSms } from "./admin-invite-sms.ts";
import { adminNotifyPhoneDigitsFromEnv } from "../contact.ts";
import type { CleanerProfile, Job, JobAssignment } from "../domain/types.ts";
import { cleanerCleaningSmsDetailsFromJob } from "../format.ts";
import { sendSms, SmsDeliveryError } from "../services/sms.ts";

async function sendAdminInviteResponseSms(
  logTag: "accept" | "decline",
  body: string,
): Promise<void> {
  const phones = adminNotifyPhoneDigitsFromEnv();
  if (phones.length === 0) {
    console.warn(`[admin:invite-${logTag}] no admin phones (set KELSEY_PHONE and/or JASMIN_PHONE)`);
    return;
  }
  for (const to of phones) {
    try {
      const result = await sendSms({ to, body }, { staff: true });
      console.info(`[admin:invite-${logTag}] sent`, { to, provider: result.provider, confirmed: result.confirmed });
    } catch (error) {
      const detail = error instanceof SmsDeliveryError ? error.userMessage : error;
      console.error(`[admin:invite-${logTag}] sms failed`, { to, detail });
    }
  }
}

function inviteResponseSmsDetails(job: Job, assignment: JobAssignment) {
  const arrivalStart = assignment.arrivalWindowStart ?? job.arrivalWindowStart;
  return cleanerCleaningSmsDetailsFromJob(job, arrivalStart, assignment.serviceDate);
}

export async function notifyAdminsCleanerAcceptedInvite(input: {
  cleaner: CleanerProfile;
  job: Job;
  assignment: JobAssignment;
}): Promise<void> {
  const body = adminInviteAcceptedSms({
    cleanerFirstName: input.cleaner.firstName,
    clientFullName: input.job.snapshot.customerDisplayName,
    details: inviteResponseSmsDetails(input.job, input.assignment),
  });
  await sendAdminInviteResponseSms("accept", body);
}

export async function notifyAdminsCleanerDeclinedInvite(input: {
  cleaner: CleanerProfile;
  job: Job;
  assignment: JobAssignment;
}): Promise<void> {
  const body = adminInviteDeclinedSms({
    cleanerFirstName: input.cleaner.firstName,
    clientFullName: input.job.snapshot.customerDisplayName,
    details: inviteResponseSmsDetails(input.job, input.assignment),
  });
  await sendAdminInviteResponseSms("decline", body);
}

import { sendCleanerText } from "@/app/actions/notifications";
import { cleanerAllowsSchedulingSms } from "@/lib/cleaner/sms-consent";
import type { CleanerProfile } from "@/lib/domain/types";
import { cleanerManualTextHref } from "@/lib/format";
import { assignmentSmsToast, followUpSmsToast, type CleanerTextResult } from "@/lib/sms-notify";

export type ManualCleanerTextPrompt = {
  firstName: string;
  href: string;
  detail: string;
};

export async function deliverSchedulingCleanerSms(input: {
  cleaner: CleanerProfile;
  body: string;
  assignmentMessage?: string;
  manualDetail: string;
}): Promise<{ toast: string; manual?: ManualCleanerTextPrompt }> {
  const base = input.assignmentMessage?.trim() || "Saved.";
  if (!cleanerAllowsSchedulingSms(input.cleaner)) {
    const href = cleanerManualTextHref(input.cleaner.mobilePhone, input.body);
    return {
      toast: `${base} ${input.cleaner.firstName} has not opted in to automated texts.`,
      manual: href
        ? { firstName: input.cleaner.firstName, href, detail: input.manualDetail }
        : undefined,
    };
  }
  try {
    const sms: CleanerTextResult = await sendCleanerText(input.cleaner.mobilePhone, input.body, {
      cleanerId: input.cleaner.cleanerId,
    });
    return { toast: assignmentSmsToast(input.cleaner.firstName, input.assignmentMessage, sms) };
  } catch {
    return {
      toast: `${base} Text not sent to ${input.cleaner.firstName}. The server could not send SMS.`,
    };
  }
}

export async function deliverSchedulingFollowUpSms(input: {
  cleaner: CleanerProfile;
  body: string;
  manualDetail: string;
}): Promise<{ toast: string; manual?: ManualCleanerTextPrompt }> {
  if (!cleanerAllowsSchedulingSms(input.cleaner)) {
    const href = cleanerManualTextHref(input.cleaner.mobilePhone, input.body);
    return {
      toast: `${input.cleaner.firstName} has not opted in to automated texts.`,
      manual: href
        ? { firstName: input.cleaner.firstName, href, detail: input.manualDetail }
        : undefined,
    };
  }
  try {
    const sms = await sendCleanerText(input.cleaner.mobilePhone, input.body, { cleanerId: input.cleaner.cleanerId });
    return { toast: followUpSmsToast(input.cleaner.firstName, sms) };
  } catch {
    return { toast: `Text not sent to ${input.cleaner.firstName}. The server could not send SMS.` };
  }
}

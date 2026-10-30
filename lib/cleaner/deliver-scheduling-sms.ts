import { sendCleanerText } from "@/app/actions/notifications";
import { cleanerAllowsSchedulingSms } from "@/lib/cleaner/sms-consent";
import type { AssignmentSmsKind, CleanerProfile } from "@/lib/domain/types";
import { cleanerManualTextHref } from "@/lib/format";
import { assignmentSmsToast, followUpSmsToast, type CleanerTextResult } from "@/lib/sms-notify";

export type ManualCleanerTextPrompt = {
  firstName: string;
  href: string;
  detail: string;
};

export type AssignmentSmsLogContext = {
  assignmentId: string;
  jobId: string;
  kind: AssignmentSmsKind;
};

export async function deliverSchedulingCleanerSms(input: {
  cleaner: CleanerProfile;
  body: string;
  assignmentMessage?: string;
  manualDetail: string;
  assignmentLog?: AssignmentSmsLogContext;
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
      assignmentLog: input.assignmentLog,
    });
    return { toast: assignmentSmsToast(input.cleaner.firstName, input.assignmentMessage, sms) };
  } catch {
    return {
      toast: `${base} Text not sent to ${input.cleaner.firstName}. The server could not send SMS.`,
    };
  }
}

/** Run SMS after the hub mutation is saved; never blocks or rolls back the mutation. */
export function queueSchedulingSmsDelivery(
  flash: (message: string) => void,
  showManual: (manual: ManualCleanerTextPrompt) => void,
  promise: Promise<{ toast: string; manual?: ManualCleanerTextPrompt }>,
  fallbackSavedMessage?: string,
  onSettled?: () => void,
): void {
  void promise
    .then((outcome) => {
      flash(outcome.toast);
      if (outcome.manual) showManual(outcome.manual);
    })
    .catch(() => {
      flash(`${fallbackSavedMessage?.trim() || "Saved."} Text could not be sent.`);
    })
    .finally(() => onSettled?.());
}

export async function deliverSchedulingFollowUpSms(input: {
  cleaner: CleanerProfile;
  body: string;
  manualDetail: string;
  assignmentLog?: AssignmentSmsLogContext;
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
    const sms = await sendCleanerText(input.cleaner.mobilePhone, input.body, {
      cleanerId: input.cleaner.cleanerId,
      assignmentLog: input.assignmentLog,
    });
    return { toast: followUpSmsToast(input.cleaner.firstName, sms) };
  } catch {
    return { toast: `Text not sent to ${input.cleaner.firstName}. The server could not send SMS.` };
  }
}

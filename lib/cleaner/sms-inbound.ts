import { applySchedulingSmsEnrollment } from "@/lib/cleaner/sms-consent-record";
import { cleanerAllowsSchedulingSms } from "@/lib/cleaner/sms-consent";
import {
  parseInboundSmsKeyword,
  smsConsentMethodForOptInKeyword,
  type InboundSmsKeyword,
} from "@/lib/cleaner/sms-inbound-keywords";
import { normalizePhone } from "@/lib/domain/customers";
import type { CleanerProfile } from "@/lib/domain/types";
import type { HubData } from "@/lib/mock/seed";

export function phoneDigits10FromE164(from: string): string | null {
  const digits = from.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return national.length === 10 ? national : null;
}

export function findCleanersByInboundPhone(hub: HubData, phone10: string): CleanerProfile[] {
  return hub.cleaners.filter((cleaner) => normalizePhone(cleaner.mobilePhone) === phone10);
}

export type InboundSmsReply =
  | { action: "none" }
  | { action: "message"; body: string }
  | { action: "opt_in"; body: string; cleaners: CleanerProfile[] }
  | { action: "opt_out"; body: string; cleaners: CleanerProfile[] };

export function planInboundSmsReply(hub: HubData, fromE164: string, body: string): InboundSmsReply {
  const keyword = parseInboundSmsKeyword(body);
  const phone10 = phoneDigits10FromE164(fromE164);
  if (!phone10) {
    return { action: "none" };
  }

  if (keyword.type === "help") {
    return {
      action: "message",
      body:
        "Golden Hour Cleaning Co. / Golden Hour Hub scheduling texts. For help, contact Jasmin. Reply STOP to unsubscribe.",
    };
  }

  if (keyword.type === "opt_out") {
    const matches = findCleanersByInboundPhone(hub, phone10);
    if (matches.length === 0) {
      return {
        action: "message",
        body: "Golden Hour Cleaning Co.: This number is not subscribed to Golden Hour Hub scheduling texts.",
      };
    }
    const now = new Date().toISOString();
    const updated = matches.map((cleaner) =>
      applySchedulingSmsEnrollment(cleaner, {
        optIn: false,
        mobilePhone: phone10,
        recordedAt: now,
        updatedBy: "sms:stop",
        consentMethod: "sms_stop",
      }),
    );
    return {
      action: "opt_out",
      body: "Golden Hour Cleaning Co.: You are unsubscribed from Golden Hour Hub scheduling texts. Reply START to resubscribe.",
      cleaners: updated,
    };
  }

  if (keyword.type === "opt_in") {
    const matches = findCleanersByInboundPhone(hub, phone10);
    if (matches.length === 0) {
      return {
        action: "message",
        body:
          "Golden Hour Cleaning Co.: We could not match this number to a contractor profile in Golden Hour Hub. Sign in to the app to confirm your mobile number, or contact Jasmin for help.",
      };
    }
    const alreadySubscribed = matches.every((cleaner) => cleanerAllowsSchedulingSms(cleaner));
    if (alreadySubscribed) {
      return {
        action: "message",
        body: "Golden Hour Cleaning Co.: You are already subscribed to Golden Hour Hub scheduling texts. Reply STOP to unsubscribe.",
      };
    }
    const now = new Date().toISOString();
    const method = smsConsentMethodForOptInKeyword(keyword.keyword);
    const updated = matches.map((cleaner) =>
      applySchedulingSmsEnrollment(cleaner, {
        optIn: true,
        mobilePhone: phone10,
        recordedAt: now,
        updatedBy: `sms:${keyword.keyword.toLowerCase()}`,
        consentMethod: method,
      }),
    );
    return {
      action: "opt_in",
      body:
        "Golden Hour Cleaning Co.: You are subscribed to Golden Hour Hub scheduling texts. Msg frequency varies. Msg&data rates may apply. Reply STOP to cancel, HELP for help.",
      cleaners: updated,
    };
  }

  return { action: "none" };
}

export function mergeInboundCleanerUpdates(hub: HubData, updated: CleanerProfile[]): HubData {
  const byId = new Map(updated.map((cleaner) => [cleaner.cleanerId, cleaner]));
  return {
    ...hub,
    cleaners: hub.cleaners.map((cleaner) => byId.get(cleaner.cleanerId) ?? cleaner),
  };
}

export { parseInboundSmsKeyword, type InboundSmsKeyword };

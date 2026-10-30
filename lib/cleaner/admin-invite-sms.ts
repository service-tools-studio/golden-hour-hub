import type { ServiceType } from "../domain/types.ts";
import { formatLongDate, formatTimeLabel } from "../domain/time.ts";

export type AdminInviteAcceptedSmsDetails = {
  date: string;
  arrivalWindowStart?: string;
  serviceType: ServiceType;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  unit?: string;
};

function cleanerServiceLabel(serviceType: ServiceType): string {
  if (serviceType === "RECURRING") return "Standard clean";
  switch (serviceType) {
    case "DEEP_CLEAN":
      return "Deep clean";
    case "MOVE_OUT":
      return "Move-out";
    case "POST_CONSTRUCTION":
      return "Post-construction";
    case "OTHER":
      return "Other";
    default:
      return "Recurring clean";
  }
}

function cleaningSmsDateTime(details: Pick<AdminInviteAcceptedSmsDetails, "date" | "arrivalWindowStart">): string {
  if (!details.arrivalWindowStart) {
    return `${formatLongDate(details.date)} (start time to be confirmed)`;
  }
  return `${formatLongDate(details.date)} at ${formatTimeLabel(details.arrivalWindowStart)}`;
}

function cleaningSmsAddress(details: Pick<AdminInviteAcceptedSmsDetails, "streetAddress" | "city" | "state" | "zip" | "unit">): string {
  const region = [details.state, details.zip].filter(Boolean).join(" ");
  const street = [details.streetAddress, details.unit?.trim()].filter(Boolean).join(", ");
  return [street, details.city, region].filter(Boolean).join(", ");
}

/** Ops alert when a cleaner accepts an invite (Kelsey / Jasmin via Twilio). */
export function adminInviteAcceptedSms(input: {
  cleanerFirstName: string;
  clientFullName: string;
  details: AdminInviteAcceptedSmsDetails;
}): string {
  return [
    `${input.cleanerFirstName} has just accepted the invite for this job:`,
    "",
    cleaningSmsDateTime(input.details),
    "",
    `${input.clientFullName.trim()} - ${cleanerServiceLabel(input.details.serviceType)}`,
    "",
    cleaningSmsAddress(input.details),
  ].join("\n");
}

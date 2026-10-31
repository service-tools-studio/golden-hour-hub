import { addDays, formatWeekRange } from "../domain/time.ts";

/** Ops alert when a cleaner submits or updates weekly availability (Kelsey / Jasmin via Twilio). */
export function adminAvailabilitySubmittedSms(input: {
  cleanerFirstName: string;
  weekStart: string;
  kind: "submitted" | "updated";
}): string {
  const weekEnd = addDays(input.weekStart, 6);
  const weekLabel = formatWeekRange(input.weekStart, weekEnd);
  const verb = input.kind === "updated" ? "updated availability for" : "submitted availability for";
  return `Golden Hour Hub: ${input.cleanerFirstName} ${verb} the week of ${weekLabel}.`;
}

/** Ops alert when Gmail calendar sync creates new Hub import rows (Jasmin via Twilio). */
export function adminNewCalendarImportSms(input: { count: number; dashboardUrl?: string }): string {
  const noun = input.count === 1 ? "job" : "jobs";
  const lines = [
    `Golden Hour: ${input.count} new Gmail ${noun} to review on the dashboard.`,
  ];
  const url = input.dashboardUrl?.trim();
  if (url) lines.push("", url);
  return lines.join("\n");
}
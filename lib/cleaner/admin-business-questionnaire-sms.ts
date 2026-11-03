/** Ops alert when a cleaner submits business information (Jasmin via Twilio). */
export function adminBusinessQuestionnaireSubmittedSms(input: {
  cleanerFirstName: string;
  businessDisplayName: string;
  kind: "submitted" | "updated";
}): string {
  const verb = input.kind === "updated" ? "updated" : "submitted";
  const name = input.businessDisplayName.trim() || "their business";
  return `Golden Hour Hub: ${input.cleanerFirstName} ${verb} business information (${name}).`;
}

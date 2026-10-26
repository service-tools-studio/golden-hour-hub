import { formatMoney } from "./compensation.ts";
import type { JobAssignment, PayType } from "./types.ts";

function helperCrewSuffix(crewSize: number): string {
  return `, ${crewSize} person crew`;
}

export function assignmentPayFieldLabel(bringsHelpers: boolean, payType: PayType): string {
  if (bringsHelpers) {
    return payType === "HOURLY" ? "Pay per crew hour" : "Total for crew per job";
  }
  return payType === "HOURLY" ? "Pay per hour" : "Total per job";
}

export function assignmentPayFieldAriaLabel(bringsHelpers: boolean, payType: PayType): string {
  if (bringsHelpers) {
    return payType === "HOURLY" ? "Crew pay per hour" : "Crew total pay per job";
  }
  return payType === "HOURLY" ? "Pay per hour" : "Total pay per job";
}

export function assignmentPayFieldHints(input: {
  bringsHelpers: boolean;
  payType: PayType;
  crewTotalCents: number;
  perPersonCents: number;
  crewSize: number;
}): string[] {
  const { bringsHelpers, payType, crewTotalCents, perPersonCents, crewSize } = input;
  if (!bringsHelpers) {
    if (payType === "FLAT") return [`${formatMoney(crewTotalCents)} total for the job`];
    return [`${formatMoney(crewTotalCents)} per hour`];
  }
  const helperSuffix = helperCrewSuffix(crewSize);
  if (payType === "FLAT") {
    return [
      `${formatMoney(crewTotalCents)} total for crew for the job`,
      `${formatMoney(perPersonCents)} per person for the job${helperSuffix}`,
    ];
  }
  return [`${formatMoney(perPersonCents)} per person per hour${helperSuffix}`];
}

export function assignmentPayPerPersonDetail(
  assignment: Pick<JobAssignment, "payType" | "payPerPersonCents">,
  crewSize: number,
): string {
  const crewSuffix = helperCrewSuffix(crewSize);
  if (assignment.payType === "FLAT") {
    return `${formatMoney(assignment.payPerPersonCents)} per person for the job${crewSuffix}`;
  }
  return `${formatMoney(assignment.payPerPersonCents)} per person per hour${crewSuffix}`;
}

export function cleanerInvitationPayLines(input: {
  bringsHelpers: boolean;
  payType: PayType;
  crewTotalCents: number;
  perPersonCents: number;
  crewSize: number;
}): string[] {
  if (input.payType === "HOURLY") return [];
  return assignmentPayFieldHints(input);
}

export function assignmentPaySummaryLine(
  assignment: Pick<JobAssignment, "payType" | "proposedTotalPayCents" | "confirmedTotalPayCents">,
  confirmed: boolean,
  bringsHelpers: boolean,
): string {
  const cents = confirmed
    ? (assignment.confirmedTotalPayCents ?? assignment.proposedTotalPayCents)
    : assignment.proposedTotalPayCents;
  if (assignment.payType === "HOURLY") return `${formatMoney(cents)} per hour`;
  if (bringsHelpers) return `${formatMoney(cents)} total for crew for the job`;
  return `${formatMoney(cents)} total for the job`;
}

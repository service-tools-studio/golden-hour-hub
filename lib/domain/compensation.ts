/** Money is integer cents so totals do not drift. */

export function calculateFlatPayPerPerson(
  proposedTotalPayCents: number,
  proposedCrewSize: number,
): number {
  if (!Number.isInteger(proposedCrewSize) || proposedCrewSize < 1) {
    throw new Error("Proposed crew size must be at least 1.");
  }
  if (!Number.isInteger(proposedTotalPayCents) || proposedTotalPayCents < 0) {
    throw new Error("Proposed pay is invalid.");
  }
  return Math.round(proposedTotalPayCents / proposedCrewSize);
}

export function calculateConfirmedFlatPay(
  payPerPersonCents: number,
  confirmedCrewSize: number,
): number {
  return payPerPersonCents * confirmedCrewSize;
}

export function calculateConfirmedHourlyCrewRate(
  hourlyPerPersonCents: number,
  confirmedCrewSize: number,
): number {
  return hourlyPerPersonCents * confirmedCrewSize;
}

export function confirmedCompensationCents(input: {
  payType: "FLAT" | "HOURLY";
  payPerPersonCents: number;
  confirmedCrewSize: number;
}): number {
  if (input.payType === "HOURLY") {
    return calculateConfirmedHourlyCrewRate(input.payPerPersonCents, input.confirmedCrewSize);
  }
  return calculateConfirmedFlatPay(input.payPerPersonCents, input.confirmedCrewSize);
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

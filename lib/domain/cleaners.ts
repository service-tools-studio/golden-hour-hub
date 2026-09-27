import type { Result } from "./types.ts";

export function deriveCrewSettings(input: {
  helpersApproved: boolean;
  typicalHelperCount: number;
}): Result<{
  helpersApproved: boolean;
  typicalHelperCount: number;
  typicalCrewSize: number;
}> {
  if (!input.helpersApproved) {
    return {
      ok: true,
      helpersApproved: false,
      typicalHelperCount: 0,
      typicalCrewSize: 1,
    };
  }
  if (
    !Number.isInteger(input.typicalHelperCount) ||
    input.typicalHelperCount < 0 ||
    input.typicalHelperCount > 8
  ) {
    return { ok: false, message: "Enter a usual helper count from 0 to 8." };
  }
  return {
    ok: true,
    helpersApproved: true,
    typicalHelperCount: input.typicalHelperCount,
    typicalCrewSize: 1 + input.typicalHelperCount,
  };
}

export function personName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

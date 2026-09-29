import type { Result } from "./types.ts";

/** Helpers are approved exactly when the admin has allowed at least one. */
export function helpersApproved(maxHelperCount: number): boolean {
  return maxHelperCount > 0;
}

export function typicalCrewSize(typicalHelperCount: number): number {
  return 1 + typicalHelperCount;
}

export function maxCrewSize(maxHelperCount: number): number {
  return 1 + maxHelperCount;
}

export function deriveCrewSettings(input: {
  typicalHelperCount: number;
  maxHelperCount: number;
}): Result<{ typicalHelperCount: number; maxHelperCount: number }> {
  if (!Number.isInteger(input.typicalHelperCount) || input.typicalHelperCount < 0) {
    return { ok: false, message: "Enter a typical helper count of 0 or more." };
  }
  if (!Number.isInteger(input.maxHelperCount) || input.maxHelperCount < 0) {
    return { ok: false, message: "Enter a maximum helper count of 0 or more." };
  }
  if (input.typicalHelperCount > input.maxHelperCount) {
    return { ok: false, message: "Typical helpers cannot be more than the maximum approved." };
  }
  return {
    ok: true,
    typicalHelperCount: input.typicalHelperCount,
    maxHelperCount: input.maxHelperCount,
  };
}

export function validateProposedCrewSize(maxHelperCount: number, proposedCrewSize: number): Result<{ ok: true }> {
  if (!Number.isInteger(proposedCrewSize) || proposedCrewSize < 1) {
    return { ok: false, message: "Enter a crew size of at least 1." };
  }
  const ceiling = maxCrewSize(maxHelperCount);
  if (proposedCrewSize > ceiling) {
    return {
      ok: false,
      message:
        ceiling === 1
          ? "You can only attend on your own for this job."
          : `Your approved crew size is ${ceiling}.`,
    };
  }
  return { ok: true };
}

export function personName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

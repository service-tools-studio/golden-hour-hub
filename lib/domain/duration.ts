import type { Result } from "./types.ts";

export const OPTIONAL_DURATION_MIN_MINUTES = 30;
export const OPTIONAL_DURATION_MAX_MINUTES = 12 * 60;

/** Treat unset, null, and legacy `0` as no estimate. */
export function parseOptionalDurationMinutes(value: number | undefined | null): number | undefined {
  if (value === undefined || value === null || value === 0) return undefined;
  return value;
}

export function hasKnownDurationMinutes(value: number | undefined | null): value is number {
  const parsed = parseOptionalDurationMinutes(value);
  return parsed !== undefined && Number.isInteger(parsed) && parsed > 0;
}

export function validateOptionalDurationMinutes(
  value: number | undefined | null,
): Result<{ expectedDurationMinutes?: number }> {
  const parsed = parseOptionalDurationMinutes(value);
  if (parsed === undefined) return { ok: true };
  if (!Number.isInteger(parsed) || parsed < OPTIONAL_DURATION_MIN_MINUTES || parsed > OPTIONAL_DURATION_MAX_MINUTES) {
    return { ok: false, message: "Enter a duration between 30 minutes and 12 hours." };
  }
  return { ok: true, expectedDurationMinutes: parsed };
}

/** Normalize visit or assignment duration fields before persisting. */
export function normalizeExpectedDurationMinutes(
  value: number | undefined | null,
): number | undefined {
  return validateOptionalDurationMinutes(value).ok
    ? parseOptionalDurationMinutes(value)
    : undefined;
}

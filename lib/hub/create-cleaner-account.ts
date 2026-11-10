import { deriveCrewSettings } from "../domain/cleaners.ts";
import { normalizePhone } from "../domain/customers.ts";
import { isMarketId, type MarketId } from "../domain/markets.ts";
import type { CleanerProfile } from "../domain/types.ts";
import type { HubData } from "../mock/seed.ts";

export type CreateCleanerAccountInput = {
  firstName: string;
  lastName: string;
  email: string;
  mobilePhone: string;
  homeMarketId: MarketId;
  typicalHelperCount: number;
  maxHelperCount: number;
  typicalHourlyRateCents: number;
};

export type CreateCleanerAccountFieldErrors = Partial<Record<keyof CreateCleanerAccountInput, string>>;

export function normalizeCreateCleanerAccountInput(
  input: CreateCleanerAccountInput,
): CreateCleanerAccountInput & { email: string; mobilePhone: string } {
  return {
    ...input,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email: input.email.trim().toLowerCase(),
    mobilePhone: input.mobilePhone.trim(),
  };
}

export function validateCreateCleanerAccountInput(
  input: CreateCleanerAccountInput,
  hub: HubData,
): { ok: true; value: CreateCleanerAccountInput & { email: string; mobilePhone: string } } | { ok: false; message: string; fieldErrors: CreateCleanerAccountFieldErrors } {
  const normalized = normalizeCreateCleanerAccountInput(input);
  const fieldErrors: CreateCleanerAccountFieldErrors = {};

  if (!normalized.firstName) fieldErrors.firstName = "Enter a first name.";
  if (!normalized.lastName) fieldErrors.lastName = "Enter a last name.";
  if (!normalized.email) {
    fieldErrors.email = "Enter an email.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) {
    fieldErrors.email = "Enter a valid email.";
  } else if (
    hub.cleaners.some((cleaner) => cleaner.email.trim().toLowerCase() === normalized.email)
  ) {
    fieldErrors.email = "A cleaner with this email is already on the team.";
  }

  const phone = normalizePhone(normalized.mobilePhone);
  if (!phone) fieldErrors.mobilePhone = "Enter a 10-digit mobile number.";

  const crew = deriveCrewSettings({
    typicalHelperCount: normalized.typicalHelperCount,
    maxHelperCount: normalized.maxHelperCount,
  });
  if (!crew.ok) {
    fieldErrors.typicalHelperCount = crew.message;
    fieldErrors.maxHelperCount = crew.message;
  }

  if (!isMarketId(normalized.homeMarketId)) {
    fieldErrors.homeMarketId = "Choose Portland or Phoenix.";
  }

  if (!Number.isInteger(normalized.typicalHourlyRateCents) || normalized.typicalHourlyRateCents < 0) {
    fieldErrors.typicalHourlyRateCents = "Enter a valid hourly rate.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    const first = Object.values(fieldErrors).find(Boolean) ?? "Complete the form.";
    return { ok: false, message: first, fieldErrors };
  }

  return {
    ok: true,
    value: {
      ...normalized,
      mobilePhone: phone!,
      typicalHelperCount: crew.ok ? crew.typicalHelperCount : normalized.typicalHelperCount,
      maxHelperCount: crew.ok ? crew.maxHelperCount : normalized.maxHelperCount,
    },
  };
}

export function buildNewCleanerProfile(
  input: CreateCleanerAccountInput & { email: string; mobilePhone: string },
  cleanerId: string,
  now: string,
  createdBy: string,
): CleanerProfile {
  return {
    cleanerId,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    mobilePhone: input.mobilePhone,
    status: "ACTIVE",
    typicalHelperCount: input.typicalHelperCount,
    maxHelperCount: input.maxHelperCount,
    typicalHourlyRateCents: input.typicalHourlyRateCents,
    homeMarketId: input.homeMarketId,
    createdAt: now,
    createdBy,
    updatedAt: now,
    updatedBy: createdBy,
  };
}

export function cleanerProfileWithCognitoSub(
  cleaner: CleanerProfile,
  cognitoSub: string,
  now: string,
  updatedBy: string,
): CleanerProfile {
  return {
    ...cleaner,
    cognitoSub,
    updatedAt: now,
    updatedBy,
  };
}

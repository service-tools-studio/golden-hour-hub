"use server";

import { randomUUID } from "node:crypto";
import { AuthError, requireAdmin } from "@/lib/auth/guards";
import { cognitoConfigured } from "@/lib/auth/config";
import {
  addUserToCleanerGroup,
  createCleanerCognitoUser,
  deleteCognitoUser,
} from "@/lib/auth/cognito-admin";
import {
  deleteCleanerProfile,
  dynamoConfigured,
  loadHub,
  persistCleanerProfile,
} from "@/lib/data/repository";
import { emptyHub, type HubData } from "@/lib/mock/seed";
import { todayInBusinessZone } from "@/lib/domain/time";
import {
  buildNewCleanerProfile,
  cleanerProfileWithCognitoSub,
  type CreateCleanerAccountFieldErrors,
  type CreateCleanerAccountInput,
  validateCreateCleanerAccountInput,
} from "@/lib/hub/create-cleaner-account";

export type CreateCleanerAccountResult =
  | {
      ok: true;
      cleanerId: string;
      email: string;
      cognitoInviteSent: true;
      hub: HubData;
      /** Cognito user exists but cognitoSub was not saved — cleaner can still sign in via email match. */
      profileLinkPending?: boolean;
    }
  | {
      ok: false;
      message: string;
      fieldErrors?: CreateCleanerAccountFieldErrors;
    };

export async function createCleanerAccountAction(
  input: CreateCleanerAccountInput,
): Promise<CreateCleanerAccountResult> {
  try {
    const session = await requireAdmin();
    if (!dynamoConfigured()) {
      return { ok: false, message: "Hub is in preview mode." };
    }
    if (!cognitoConfigured()) {
      return { ok: false, message: "Sign-in is not configured." };
    }

    const hub = await loadHub();
    const validated = validateCreateCleanerAccountInput(input, hub);
    if (!validated.ok) {
      return { ok: false, message: validated.message, fieldErrors: validated.fieldErrors };
    }

    const now = new Date().toISOString();
    const cleanerId = randomUUID();
    let profile = buildNewCleanerProfile(validated.value, cleanerId, now, session.email);

    try {
      await persistCleanerProfile(profile);
    } catch (error) {
      console.error("persistCleanerProfile failed.", error);
      return { ok: false, message: "Could not save the cleaner profile." };
    }

    const cognito = await createCleanerCognitoUser({
      email: validated.value.email,
      firstName: validated.value.firstName,
      lastName: validated.value.lastName,
    });
    if (!cognito.ok) {
      try {
        await deleteCleanerProfile(cleanerId);
      } catch (deleteError) {
        console.error("deleteCleanerProfile rollback failed.", deleteError);
      }
      return { ok: false, message: cognito.message, fieldErrors: { email: cognito.message } };
    }

    const group = await addUserToCleanerGroup(cognito.username);
    if (!group.ok) {
      await deleteCognitoUser(cognito.username);
      try {
        await deleteCleanerProfile(cleanerId);
      } catch (deleteError) {
        console.error("deleteCleanerProfile rollback failed.", deleteError);
      }
      return { ok: false, message: group.message };
    }

    profile = cleanerProfileWithCognitoSub(profile, cognito.sub, now, session.email);
    let profileLinkPending = false;
    try {
      await persistCleanerProfile(profile);
    } catch (error) {
      console.error("persistCleanerProfile (cognitoSub) failed.", error);
      profileLinkPending = true;
    }

    return {
      ok: true,
      cleanerId,
      email: validated.value.email,
      cognitoInviteSent: true,
      hub: { ...emptyHub(todayInBusinessZone()), cleaners: [profile] },
      ...(profileLinkPending ? { profileLinkPending: true } : {}),
    };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("createCleanerAccountAction failed.", error);
    return { ok: false, message: "Could not create the cleaner." };
  }
}

"use server";

import { AuthError, requireAdmin, requireCleaner } from "@/lib/auth/guards";
import { hubDataForCleaner } from "@/lib/auth/hub-scope";
import {
  dynamoConfigured,
  loadCleanerProfile,
  loadHub,
  persistCleanerProfile,
  persistCleanerQuestionnaireSubmit,
  saveHub,
} from "@/lib/data/repository";
import { emptyHub } from "@/lib/mock/seed";
import { todayInBusinessZone } from "@/lib/domain/time";
import type { ContractorQuestionnaireInput } from "@/lib/domain/contractor-questionnaire";
import { normalizeQuestionnaireInput } from "@/lib/domain/contractor-questionnaire";
import type { BusinessRegistrationVerificationStatus, CoiVerificationStatus } from "@/lib/domain/contractor-questionnaire";
import type { AdminWorkersCompComplianceUpdate } from "@/lib/domain/contractor-workers-comp-compliance";
import type { ContractorQuestionnaireSubmitAttestation } from "@/lib/domain/contractor-questionnaire-submission";
import { notifyJasminCleanerBusinessQuestionnaireSubmitted } from "@/lib/cleaner/admin-business-questionnaire-notify";
import {
  saveContractorQuestionnaireOnHub,
  updateContractorCoiVerificationOnHub,
  updateContractorQuestionnaireReviewOnHub,
  updateContractorRegistrationVerificationOnHub,
  updateContractorWorkersCompComplianceOnHub,
} from "@/lib/hub/contractor-questionnaire-mutations";
import type { HubData } from "@/lib/mock/seed";

type DraftMutationResult =
  | { ok: true; message: string; data: HubData }
  | { ok: false; message: string };

type SubmitMutationResult =
  | { ok: true; message: string; data: HubData }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

export async function saveContractorQuestionnaireDraftAction(
  input: ContractorQuestionnaireInput,
): Promise<DraftMutationResult> {
  try {
    const session = await requireCleaner();
    if (!session.cleanerId) return { ok: false, message: "Your cleaner profile is not linked in Hub." };
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    const cleaner = await loadCleanerProfile(session.cleanerId);
    if (!cleaner) return { ok: false, message: "Cleaner not found." };
    const now = new Date().toISOString();
    const hubSlice = { ...emptyHub(todayInBusinessZone()), cleaners: [cleaner] };
    const outcome = saveContractorQuestionnaireOnHub(
      hubSlice,
      session.cleanerId,
      input,
      session.email,
      now,
      "draft",
    );
    if (!outcome.result.ok) return outcome.result;
    const nextCleaner = outcome.hub.cleaners.find((item) => item.cleanerId === session.cleanerId);
    if (!nextCleaner) return { ok: false, message: "Could not save business information." };
    await persistCleanerProfile(nextCleaner);
    return {
      ok: true,
      message: "Form saved.",
      data: hubDataForCleaner(
        { ...outcome.hub, cleaners: [nextCleaner] },
        session.cleanerId,
      ),
    };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("saveContractorQuestionnaireDraftAction failed.", error);
    return { ok: false, message: "Could not save business information." };
  }
}

export async function submitContractorQuestionnaireAction(
  input: ContractorQuestionnaireInput,
  attestation: ContractorQuestionnaireSubmitAttestation,
): Promise<SubmitMutationResult> {
  try {
    const session = await requireCleaner();
    if (!session.cleanerId) return { ok: false, message: "Your cleaner profile is not linked in Hub." };
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    const hub = await loadHub();
    const now = new Date().toISOString();
    const cleanerBefore = hub.cleaners.find((item) => item.cleanerId === session.cleanerId);
    const wasSubmitted = Boolean(cleanerBefore?.businessQuestionnaire?.submittedAt);
    const outcome = saveContractorQuestionnaireOnHub(
      hub,
      session.cleanerId,
      input,
      session.email,
      now,
      "submit",
      {
        attestation,
        cognitoSub: session.sub,
        email: session.email,
      },
    );
    if (!outcome.result.ok) {
      return {
        ok: false,
        message: outcome.result.message,
        fieldErrors: {
          ...(outcome.fieldErrors
            ? Object.fromEntries(Object.entries(outcome.fieldErrors).map(([key, value]) => [key, value]))
            : {}),
          ...(outcome.attestationFieldErrors ?? {}),
        },
      };
    }
    const nextCleaner = outcome.hub.cleaners.find((item) => item.cleanerId === session.cleanerId);
    const submission = outcome.hub.contractorQuestionnaireSubmissions.at(-1);
    if (!nextCleaner || !submission) {
      return { ok: false, message: "Could not save business information." };
    }
    await persistCleanerQuestionnaireSubmit(nextCleaner, submission);
    const cleanerAfter = outcome.hub.cleaners.find((item) => item.cleanerId === session.cleanerId);
    if (cleanerAfter && outcome.submitted) {
      try {
        await notifyJasminCleanerBusinessQuestionnaireSubmitted({
          cleaner: cleanerAfter,
          businessDisplayName: input.businessDisplayName,
          kind: wasSubmitted ? "updated" : "submitted",
        });
      } catch (error) {
        console.error("[admin:business-questionnaire] notify failed", error);
      }
    }
    return {
      ok: true,
      message: "Submitted.",
      data: hubDataForCleaner(outcome.hub, session.cleanerId),
    };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("submitContractorQuestionnaireAction failed.", error);
    return { ok: false, message: "Could not submit business information." };
  }
}

export async function updateContractorQuestionnaireReviewAction(
  cleanerId: string,
  status: "NEEDS_REVIEW" | "REVIEWED",
): Promise<{ ok: true; data: HubData } | { ok: false; message: string }> {
  try {
    const session = await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    const hub = await loadHub();
    const now = new Date().toISOString();
    const { hub: next, result } = updateContractorQuestionnaireReviewOnHub(
      hub,
      cleanerId,
      status,
      session.email,
      now,
    );
    if (!result.ok) return result;
    await saveHub(next);
    return { ok: true, data: next };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("updateContractorQuestionnaireReviewAction failed.", error);
    return { ok: false, message: "Could not update review status." };
  }
}

export async function updateContractorRegistrationVerificationAction(
  cleanerId: string,
  status: BusinessRegistrationVerificationStatus,
): Promise<{ ok: true; data: HubData } | { ok: false; message: string }> {
  try {
    const session = await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    const hub = await loadHub();
    const now = new Date().toISOString();
    const { hub: next, result } = updateContractorRegistrationVerificationOnHub(
      hub,
      cleanerId,
      status,
      session.email,
      now,
    );
    if (!result.ok) return result;
    await saveHub(next);
    return { ok: true, data: next };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("updateContractorRegistrationVerificationAction failed.", error);
    return { ok: false, message: "Could not update registration verification." };
  }
}

export async function updateContractorCoiVerificationAction(
  cleanerId: string,
  status: CoiVerificationStatus,
): Promise<{ ok: true; data: HubData } | { ok: false; message: string }> {
  try {
    const session = await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    const hub = await loadHub();
    const now = new Date().toISOString();
    const { hub: next, result } = updateContractorCoiVerificationOnHub(
      hub,
      cleanerId,
      status,
      session.email,
      now,
    );
    if (!result.ok) return result;
    await saveHub(next);
    return { ok: true, data: next };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("updateContractorCoiVerificationAction failed.", error);
    return { ok: false, message: "Could not update COI verification." };
  }
}

export async function updateContractorWorkersCompComplianceAction(
  cleanerId: string,
  update: AdminWorkersCompComplianceUpdate,
): Promise<{ ok: true; data: HubData } | { ok: false; message: string }> {
  try {
    const session = await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    const hub = await loadHub();
    const now = new Date().toISOString();
    const { hub: next, result } = updateContractorWorkersCompComplianceOnHub(
      hub,
      cleanerId,
      update,
      session.email,
      now,
    );
    if (!result.ok) return result;
    await saveHub(next);
    return { ok: true, data: next };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("updateContractorWorkersCompComplianceAction failed.", error);
    return { ok: false, message: "Could not update workers' compensation compliance." };
  }
}

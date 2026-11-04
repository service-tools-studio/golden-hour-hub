"use client";

import { useState, useTransition } from "react";
import {
  updateContractorCoiVerificationAction,
  updateContractorQuestionnaireReviewAction,
  updateContractorRegistrationVerificationAction,
} from "@/app/actions/contractor-questionnaire";
import { ContractorQuestionnaireSubmissionHistory } from "@/components/admin/contractor-questionnaire-submission-history";
import { ContractorWorkersCompAdminSection } from "@/components/admin/contractor-workers-comp-admin-section";
import type { ContractorQuestionnaireSubmissionRecord } from "@/lib/domain/contractor-questionnaire-submission";
import { useHub } from "@/components/hub-provider";
import { Card, FormSubmitNotice, SecondaryButton } from "@/components/ui";
import type { CleanerProfile } from "@/lib/domain/types";
import { formatPhone } from "@/lib/domain/customers";
import type { BusinessRegistrationVerificationStatus, ContractorQuestionnaireInput, CoiVerificationStatus } from "@/lib/domain/contractor-questionnaire";
import {
  businessStructureLabel,
  coiVerificationStatusLabel,
  effectiveCoiVerificationStatus,
  effectiveCoiVerificationStatusLabel,
  formatTeamMemberForAdmin,
  generalLiabilityInsuranceStatusLabel,
  helperPaymentArrangementLabel,
  insuranceOregonCoverageStatusLabel,
  insurancePolicyIsExpired,
  oregonServiceStatusLabel,
  questionnaireEffectiveReviewStatus,
  questionnaireReviewStatusLabel,
  registrationStatusLabel,
  registrationVerificationStatusLabel,
  reviewFlagLabel,
  teamRelationshipLabel,
  workersCompNoReasonLabel,
  workersCompStatusLabel,
} from "@/lib/domain/contractor-questionnaire";
import { US_STATE_OPTIONS } from "@/lib/domain/us-states";

function stateLabel(code: string | undefined): string {
  if (!code) return "—";
  return US_STATE_OPTIONS.find((item) => item.value === code)?.label ?? code;
}

function formatUpdated(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatInsuranceExpirationDate(date: string | undefined): string {
  if (!date) return "—";
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "medium",
  });
}

function trimDisplay(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function draftHasSavedAnswers(draft: ContractorQuestionnaireInput | undefined): boolean {
  if (!draft) return false;
  if (trimDisplay(draft.businessDisplayName)) return true;
  if (trimDisplay(draft.ownerLegalName)) return true;
  if (draft.registrationStatus) return true;
  if (trimDisplay(draft.businessStreetAddress)) return true;
  if (trimDisplay(draft.businessPhone)) return true;
  if (trimDisplay(draft.businessEmail)) return true;
  if (draft.oregonServiceStatus) return true;
  if (draft.generalLiabilityStatus) return true;
  if (trimDisplay(draft.insuranceProviderName)) return true;
  if (trimDisplay(draft.insuranceExpirationDate)) return true;
  if (draft.insuranceOregonCoverage) return true;
  if (draft.hasAdditionalWorkers === true || draft.hasAdditionalWorkers === false) return true;
  return draft.teamMembers.some((member) => trimDisplay(member.firstName) || trimDisplay(member.lastName));
}

function DraftBusinessDetails({
  draft,
  draftSavedAt,
}: {
  draft: ContractorQuestionnaireInput;
  draftSavedAt?: string;
}) {
  const addressLines = [
    trimDisplay(draft.businessStreetAddress),
    [trimDisplay(draft.businessCity), draft.businessState ? stateLabel(draft.businessState) : null, trimDisplay(draft.businessZip)]
      .filter(Boolean)
      .join(", "),
  ].filter(Boolean);

  const teamMembers = draft.teamMembers
    .map((member) => {
      const first = trimDisplay(member.firstName);
      const last = trimDisplay(member.lastName);
      if (!first && !last) return null;
      return [first, last].filter(Boolean).join(" ");
    })
    .filter(Boolean);

  return (
    <dl className="mt-4 grid gap-3 text-sm">
      {trimDisplay(draft.businessDisplayName) ? (
        <div>
          <dt className="font-medium text-ink/55">Business name</dt>
          <dd>{draft.businessDisplayName.trim()}</dd>
        </div>
      ) : null}
      {trimDisplay(draft.ownerLegalName) ? (
        <div>
          <dt className="font-medium text-ink/55">Owner&apos;s legal name</dt>
          <dd>{draft.ownerLegalName.trim()}</dd>
        </div>
      ) : null}
      {draft.registrationStatus === "LLC_OR_CORP" || draft.registrationStatus === "SOLE_PROPRIETOR" ? (
        <div>
          <dt className="font-medium text-ink/55">Business structure</dt>
          <dd>
            {registrationStatusLabel(draft.registrationStatus)}
            {draft.businessStructure ? ` · ${businessStructureLabel(draft.businessStructure)}` : null}
          </dd>
        </div>
      ) : null}
      {trimDisplay(draft.registeredLegalName) ? (
        <div>
          <dt className="font-medium text-ink/55">Registered legal name</dt>
          <dd>{draft.registeredLegalName.trim()}</dd>
        </div>
      ) : null}
      {draft.registrationState ? (
        <div>
          <dt className="font-medium text-ink/55">Registration state</dt>
          <dd>{stateLabel(draft.registrationState)}</dd>
        </div>
      ) : null}
      {trimDisplay(draft.stateRegistrationNumber) ? (
        <div>
          <dt className="font-medium text-ink/55">State registration number</dt>
          <dd>{draft.stateRegistrationNumber.trim()}</dd>
        </div>
      ) : null}
      {addressLines.length > 0 || trimDisplay(draft.businessPhone) || trimDisplay(draft.businessEmail) ? (
        <div>
          <dt className="font-medium text-ink/55">Contact</dt>
          <dd className="whitespace-pre-line">
            {addressLines.join("\n")}
            {trimDisplay(draft.businessPhone) ? `\n${formatPhone(draft.businessPhone)}` : ""}
            {trimDisplay(draft.businessEmail) ? `\n${draft.businessEmail.trim()}` : ""}
          </dd>
        </div>
      ) : null}
      {draft.oregonServiceStatus ? (
        <div>
          <dt className="font-medium text-ink/55">Oregon jobs</dt>
          <dd>{oregonServiceStatusLabel(draft.oregonServiceStatus)}</dd>
        </div>
      ) : null}
      {draft.hasAdditionalWorkers === false ? (
        <div>
          <dt className="font-medium text-ink/55">Team</dt>
          <dd>Works alone</dd>
        </div>
      ) : null}
      {draft.hasAdditionalWorkers === true ? (
        <>
          {teamMembers.length > 0 ? (
            <div>
              <dt className="font-medium text-ink/55">Team</dt>
              <dd className="space-y-1">
                {draft.teamMembers
                  .filter((member) => trimDisplay(member.firstName) || trimDisplay(member.lastName))
                  .map((member, index) => (
                    <p key={index}>{formatTeamMemberForAdmin(member)}</p>
                  ))}
              </dd>
            </div>
          ) : null}
          {draft.workersCompStatus ? (
            <div>
              <dt className="font-medium text-ink/55">Workers&apos; compensation</dt>
              <dd>{workersCompStatusLabel(draft.workersCompStatus)}</dd>
            </div>
          ) : null}
          {draft.workersCompNoReason ? (
            <div>
              <dt className="font-medium text-ink/55">Workers&apos; comp explanation</dt>
              <dd>
                {workersCompNoReasonLabel(draft.workersCompNoReason)}
                {trimDisplay(draft.workersCompNoReasonOther)
                  ? ` — ${draft.workersCompNoReasonOther.trim()}`
                  : null}
              </dd>
            </div>
          ) : null}
          {draft.helperPaymentArrangement ? (
            <div>
              <dt className="font-medium text-ink/55">Payment arrangement</dt>
              <dd>{helperPaymentArrangementLabel(draft.helperPaymentArrangement)}</dd>
            </div>
          ) : null}
        </>
      ) : null}
      {draftSavedAt ? (
        <div>
          <dt className="font-medium text-ink/55">Draft last saved</dt>
          <dd>{formatUpdated(draftSavedAt)}</dd>
        </div>
      ) : null}
    </dl>
  );
}

export function ContractorBusinessAdminPanel({
  cleaner,
  submissionHistory = [],
}: {
  cleaner: CleanerProfile;
  submissionHistory?: ContractorQuestionnaireSubmissionRecord[];
}) {
  const hub = useHub();
  const questionnaire = cleaner.businessQuestionnaire;
  const reviewStatus = questionnaireEffectiveReviewStatus(questionnaire);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function applyReview(status: "NEEDS_REVIEW" | "REVIEWED") {
    setMessage(null);
    startTransition(async () => {
      const result = await updateContractorQuestionnaireReviewAction(cleaner.cleanerId, status);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      hub.mergeAdminHub(result.data);
      setMessage(status === "REVIEWED" ? "Marked as reviewed." : "Marked as needs review.");
    });
  }

  function applyRegistrationVerification(status: BusinessRegistrationVerificationStatus) {
    setMessage(null);
    startTransition(async () => {
      const result = await updateContractorRegistrationVerificationAction(cleaner.cleanerId, status);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      hub.mergeAdminHub(result.data);
      setMessage(`Registration marked ${registrationVerificationStatusLabel(status).toLowerCase()}.`);
    });
  }

  function applyCoiVerification(status: CoiVerificationStatus) {
    setMessage(null);
    startTransition(async () => {
      const result = await updateContractorCoiVerificationAction(cleaner.cleanerId, status);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      hub.mergeAdminHub(result.data);
      setMessage(`COI marked ${coiVerificationStatusLabel(status).toLowerCase()}.`);
    });
  }

  if (!questionnaire?.submittedAt) {
    const draft = cleaner.businessQuestionnaireDraft;
    if (!draftHasSavedAnswers(draft)) {
      return (
        <Card>
          <p className="text-base font-semibold">Business information</p>
          <p className="mt-2 text-sm text-ink/65">Not submitted yet.</p>
        </Card>
      );
    }
    return (
      <Card className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="text-base font-semibold">Business information</p>
          <span className="rounded-full bg-cream px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink/70">
            Not submitted
          </span>
        </div>
        <p className="text-sm text-ink/65">Draft saved by the cleaner. Shown below until they submit the form.</p>
        <DraftBusinessDetails draft={draft!} draftSavedAt={cleaner.updatedAt} />
      </Card>
    );
  }

  const address = [
    questionnaire.businessStreetAddress,
    [questionnaire.businessCity, questionnaire.businessState, questionnaire.businessZip].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-base font-semibold">Business information</p>
        <span className="rounded-full bg-cream px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink/70">
          {questionnaireReviewStatusLabel(reviewStatus)}
        </span>
      </div>

      {questionnaire.reviewFlags.length > 0 ? (
        <div className="rounded-2xl bg-gold/15 px-4 py-3">
          <p className="text-sm font-semibold text-ink">Review flags</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink/80">
            {questionnaire.reviewFlags.map((flag) => (
              <li key={flag}>{reviewFlagLabel(flag)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <dl className="grid gap-3 text-sm">
        <div>
          <dt className="font-medium text-ink/55">Business name</dt>
          <dd>{questionnaire.businessDisplayName}</dd>
        </div>
        <div>
          <dt className="font-medium text-ink/55">Owner&apos;s legal name</dt>
          <dd>{questionnaire.ownerLegalName}</dd>
        </div>
        <div>
          <dt className="font-medium text-ink/55">Business structure</dt>
          <dd>
            {registrationStatusLabel(questionnaire.registrationStatus)}
            {questionnaire.businessStructure
              ? ` · ${businessStructureLabel(questionnaire.businessStructure)}`
              : null}
          </dd>
        </div>
        {questionnaire.registeredLegalName ? (
          <div>
            <dt className="font-medium text-ink/55">Registered legal name</dt>
            <dd>{questionnaire.registeredLegalName}</dd>
          </div>
        ) : null}
        {questionnaire.registrationState ? (
          <div>
            <dt className="font-medium text-ink/55">Registration state</dt>
            <dd>{stateLabel(questionnaire.registrationState)}</dd>
          </div>
        ) : null}
        {questionnaire.registrationStatus === "LLC_OR_CORP" && questionnaire.stateRegistrationNumber ? (
          <div>
            <dt className="font-medium text-ink/55">State registration number</dt>
            <dd>{questionnaire.stateRegistrationNumber}</dd>
          </div>
        ) : null}
        {questionnaire.registrationStatus === "LLC_OR_CORP" ? (
          <div>
            <dt className="font-medium text-ink/55">Registration verification</dt>
            <dd>
              {registrationVerificationStatusLabel(
                questionnaire.registrationVerificationStatus ?? "NOT_VERIFIED",
              )}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="font-medium text-ink/55">Contact</dt>
          <dd className="whitespace-pre-line">
            {address}
            {"\n"}
            {formatPhone(questionnaire.businessPhone)}
            {"\n"}
            {questionnaire.businessEmail}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink/55">Oregon jobs</dt>
          <dd>{oregonServiceStatusLabel(questionnaire.oregonServiceStatus)}</dd>
        </div>
        <div>
          <dt className="font-medium text-ink/55">Team</dt>
          <dd>
            {questionnaire.hasAdditionalWorkers ? (
              questionnaire.teamMembers && questionnaire.teamMembers.length > 0 ? (
                <ul className="list-none space-y-1">
                  {questionnaire.teamMembers.map((member, index) => (
                    <li key={index}>{formatTeamMemberForAdmin(member)}</li>
                  ))}
                </ul>
              ) : questionnaire.teamRelationship ? (
                <span>{teamRelationshipLabel(questionnaire.teamRelationship)} (legacy)</span>
              ) : (
                "—"
              )
            ) : (
              "Owner only — no other cleaners listed"
            )}
          </dd>
        </div>
        {questionnaire.teamRelationship && questionnaire.teamMembers?.some((m) => m.workingRelationship) ? (
          <div>
            <dt className="font-medium text-ink/55">Legacy team classification</dt>
            <dd>{teamRelationshipLabel(questionnaire.teamRelationship)}</dd>
          </div>
        ) : null}
        {questionnaire.workersCompStatus ? (
          <div>
            <dt className="font-medium text-ink/55">Workers&apos; compensation</dt>
            <dd>{workersCompStatusLabel(questionnaire.workersCompStatus)}</dd>
          </div>
        ) : null}
        {questionnaire.workersCompNoReason ? (
          <div>
            <dt className="font-medium text-ink/55">Workers&apos; comp explanation</dt>
            <dd>
              {workersCompNoReasonLabel(questionnaire.workersCompNoReason)}
              {questionnaire.workersCompNoReasonOther ? ` — ${questionnaire.workersCompNoReasonOther}` : null}
            </dd>
          </div>
        ) : null}
        {questionnaire.helperPaymentArrangement ? (
          <div>
            <dt className="font-medium text-ink/55">Payment arrangement</dt>
            <dd>{helperPaymentArrangementLabel(questionnaire.helperPaymentArrangement)}</dd>
          </div>
        ) : null}
        <div>
          <dt className="font-medium text-ink/55">Last updated</dt>
          <dd>{formatUpdated(questionnaire.updatedAt)}</dd>
        </div>
        {questionnaire.reviewedAt ? (
          <div>
            <dt className="font-medium text-ink/55">Reviewed</dt>
            <dd>
              {formatUpdated(questionnaire.reviewedAt)}
              {questionnaire.reviewedBy ? ` by ${questionnaire.reviewedBy}` : null}
            </dd>
          </div>
        ) : null}
      </dl>

      {questionnaire.submittedAt ? (
        <ContractorWorkersCompAdminSection cleanerId={cleaner.cleanerId} questionnaire={questionnaire} />
      ) : null}

      <div className="border-t border-ink/10 pt-4">
        <p className="text-base font-semibold">General liability insurance</p>
        <dl className="mt-3 grid gap-3 text-sm">
          <div>
            <dt className="font-medium text-ink/55">Reported status</dt>
            <dd>
              {questionnaire.generalLiabilityStatus
                ? generalLiabilityInsuranceStatusLabel(questionnaire.generalLiabilityStatus)
                : "Not provided yet"}
            </dd>
          </div>
          {questionnaire.generalLiabilityStatus === "YES" ? (
            <>
              <div>
                <dt className="font-medium text-ink/55">Insurance provider</dt>
                <dd>{questionnaire.insuranceProviderName || "—"}</dd>
              </div>
              <div>
                <dt className="font-medium text-ink/55">Expiration date</dt>
                <dd>{formatInsuranceExpirationDate(questionnaire.insuranceExpirationDate)}</dd>
              </div>
              <div>
                <dt className="font-medium text-ink/55">Covers Oregon cleaning jobs</dt>
                <dd>
                  {questionnaire.insuranceOregonCoverage
                    ? insuranceOregonCoverageStatusLabel(questionnaire.insuranceOregonCoverage)
                    : "—"}
                </dd>
              </div>
            </>
          ) : null}
          <div>
            <dt className="font-medium text-ink/55">Insurance last updated</dt>
            <dd>{formatUpdated(questionnaire.insuranceUpdatedAt ?? questionnaire.updatedAt)}</dd>
          </div>
          <div>
            <dt className="font-medium text-ink/55">COI verification</dt>
            <dd>{effectiveCoiVerificationStatusLabel(effectiveCoiVerificationStatus(questionnaire))}</dd>
          </div>
          {questionnaire.coiVerifiedAt && effectiveCoiVerificationStatus(questionnaire) === "VERIFIED" ? (
            <div>
              <dt className="font-medium text-ink/55">COI verified</dt>
              <dd>
                {formatUpdated(questionnaire.coiVerifiedAt)}
                {questionnaire.coiVerifiedBy ? ` by ${questionnaire.coiVerifiedBy}` : null}
              </dd>
            </div>
          ) : null}
        </dl>

        {questionnaire.generalLiabilityStatus === "YES" ? (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-semibold text-ink">Certificate of insurance verification</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <SecondaryButton type="button" loading={pending} onClick={() => applyCoiVerification("NOT_RECEIVED")}>
                Not received
              </SecondaryButton>
              <SecondaryButton type="button" loading={pending} onClick={() => applyCoiVerification("NEEDS_REVIEW")}>
                Needs review
              </SecondaryButton>
              <SecondaryButton
                type="button"
                loading={pending}
                disabled={insurancePolicyIsExpired(questionnaire.insuranceExpirationDate)}
                onClick={() => applyCoiVerification("VERIFIED")}
              >
                Verified
              </SecondaryButton>
            </div>
            {insurancePolicyIsExpired(questionnaire.insuranceExpirationDate) ? (
              <p className="text-sm text-ink/65">Policy expiration date has passed. Update insurance before verifying.</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {questionnaire.registrationStatus === "LLC_OR_CORP" && questionnaire.stateRegistrationNumber ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink">State registration verification</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <SecondaryButton
              type="button"
              loading={pending}
              onClick={() => applyRegistrationVerification("NOT_VERIFIED")}
            >
              Not verified
            </SecondaryButton>
            <SecondaryButton type="button" loading={pending} onClick={() => applyRegistrationVerification("VERIFIED")}>
              Verified
            </SecondaryButton>
            <SecondaryButton
              type="button"
              loading={pending}
              onClick={() => applyRegistrationVerification("UNABLE_TO_VERIFY")}
            >
              Unable to verify
            </SecondaryButton>
          </div>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <SecondaryButton type="button" loading={pending} onClick={() => applyReview("REVIEWED")}>
          Mark reviewed
        </SecondaryButton>
        <SecondaryButton type="button" loading={pending} onClick={() => applyReview("NEEDS_REVIEW")}>
          Mark needs review
        </SecondaryButton>
      </div>

      {message ? <FormSubmitNotice message={message} tone={message.includes("Could not") ? "error" : "ok"} /> : null}

      <ContractorQuestionnaireSubmissionHistory cleaner={cleaner} submissions={submissionHistory} />
    </Card>
  );
}

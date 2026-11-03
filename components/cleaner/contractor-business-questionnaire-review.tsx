"use client";

import type { ReactNode } from "react";
import type { ContractorQuestionnaireInput } from "@/lib/domain/contractor-questionnaire";
import {
  businessStructureLabel,
  generalLiabilityInsuranceStatusLabel,
  helperPaymentArrangementLabel,
  insuranceOregonCoverageStatusLabel,
  registrationStatusLabel,
  teamMemberWorkingRelationshipLabel,
  workersCompNoReasonLabel,
  workersCompStatusLabel,
} from "@/lib/domain/contractor-questionnaire";
import type { QuestionnaireWizardStep } from "@/lib/domain/contractor-questionnaire-wizard";
import { US_STATE_OPTIONS } from "@/lib/domain/us-states";
import { formatPhoneInput } from "@/lib/format";

function stateLabel(code: string): string {
  return US_STATE_OPTIONS.find((item) => item.value === code)?.label ?? code;
}

function SummarySection({
  title,
  editStep,
  onEdit,
  children,
}: {
  title: string;
  editStep: QuestionnaireWizardStep;
  onEdit: (step: QuestionnaireWizardStep) => void;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2 rounded-2xl bg-cream/50 p-4 ring-1 ring-ink/8">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        <button
          type="button"
          className="shrink-0 text-sm font-semibold text-ink underline decoration-gold decoration-2 underline-offset-4"
          onClick={() => onEdit(editStep)}
        >
          Edit
        </button>
      </div>
      <dl className="space-y-2 text-sm text-ink/80">{children}</dl>
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string | null | undefined }) {
  const text = value?.trim();
  if (!text) return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink/50">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap leading-snug">{text}</dd>
    </div>
  );
}

export function ContractorBusinessQuestionnaireReview({
  form,
  onEditStep,
}: {
  form: ContractorQuestionnaireInput;
  onEditStep: (step: QuestionnaireWizardStep) => void;
}) {
  const registrationLine =
    form.registrationStatus === "LLC_OR_CORP"
      ? [
          registrationStatusLabel(form.registrationStatus),
          form.businessStructure ? businessStructureLabel(form.businessStructure) : null,
          form.registeredLegalName,
          form.registrationState ? stateLabel(form.registrationState) : null,
          form.stateRegistrationNumber ? `Reg. # ${form.stateRegistrationNumber}` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : form.registrationStatus
        ? registrationStatusLabel(form.registrationStatus)
        : null;

  const address = [
    form.businessStreetAddress,
    [form.businessCity, form.businessState ? stateLabel(form.businessState) : "", form.businessZip]
      .filter(Boolean)
      .join(", "),
  ]
    .filter((line) => line.trim())
    .join("\n");

  const teamMembers = form.teamMembers
    .filter((member) => member.firstName.trim() || member.lastName.trim())
    .map((member) => {
      const name = [member.firstName, member.lastName].filter(Boolean).join(" ");
      const rel = member.workingRelationship
        ? teamMemberWorkingRelationshipLabel(member.workingRelationship)
        : "";
      const other =
        member.workingRelationship === "OTHER" && member.workingRelationshipOther?.trim()
          ? ` (${member.workingRelationshipOther.trim()})`
          : "";
      return rel ? `${name} — ${rel}${other}` : name;
    });

  return (
    <div className="space-y-4">
      <SummarySection title="Your Business" editStep={1} onEdit={onEditStep}>
        <SummaryRow label="Business name" value={form.businessDisplayName} />
        <SummaryRow label="Owner legal name" value={form.ownerLegalName} />
        <SummaryRow label="Registration" value={registrationLine} />
        <SummaryRow label="Address" value={address} />
        <SummaryRow label="Phone" value={formatPhoneInput(form.businessPhone)} />
        <SummaryRow label="Email" value={form.businessEmail} />
      </SummarySection>

      <SummarySection title="Your Cleaning Team" editStep={2} onEdit={onEditStep}>
        <SummaryRow
          label="Others on jobs"
          value={
            form.hasAdditionalWorkers === true
              ? "Yes, others may perform jobs"
              : form.hasAdditionalWorkers === false
                ? "No, only the owner"
                : null
          }
        />
        {teamMembers.length > 0 ? (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink/50">Team members</dt>
            <dd className="mt-0.5">
              <ul className="list-disc space-y-1 pl-5 leading-snug">
                {teamMembers.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
        {form.hasAdditionalWorkers === true ? (
          <SummaryRow
            label="Payment arrangement"
            value={
              form.helperPaymentArrangement ? helperPaymentArrangementLabel(form.helperPaymentArrangement) : null
            }
          />
        ) : null}
      </SummarySection>

      <SummarySection title="Insurance" editStep={3} onEdit={onEditStep}>
        <SummaryRow
          label="General liability"
          value={
            form.generalLiabilityStatus
              ? generalLiabilityInsuranceStatusLabel(form.generalLiabilityStatus)
              : null
          }
        />
        {form.generalLiabilityStatus === "YES" ? (
          <>
            <SummaryRow label="Insurance company" value={form.insuranceProviderName} />
            <SummaryRow label="Policy expiration" value={form.insuranceExpirationDate} />
            <SummaryRow
              label="Oregon coverage"
              value={
                form.insuranceOregonCoverage
                  ? insuranceOregonCoverageStatusLabel(form.insuranceOregonCoverage)
                  : null
              }
            />
          </>
        ) : null}
        <SummaryRow
          label="Workers' compensation"
          value={form.workersCompStatus ? workersCompStatusLabel(form.workersCompStatus) : null}
        />
        {form.workersCompStatus === "NO" && form.workersCompNoReason ? (
          <SummaryRow label="Reason (no WC)" value={workersCompNoReasonLabel(form.workersCompNoReason)} />
        ) : null}
        {form.workersCompStatus === "YES" ? (
          <>
            <SummaryRow label="WC carrier" value={form.workersCompCarrierName} />
            <SummaryRow label="WC policy number" value={form.workersCompPolicyNumber} />
            <SummaryRow label="WC expiration" value={form.workersCompExpirationDate} />
          </>
        ) : null}
      </SummarySection>
    </div>
  );
}

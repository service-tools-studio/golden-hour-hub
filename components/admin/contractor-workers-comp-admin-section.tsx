"use client";

import { useState, useTransition } from "react";
import { updateContractorWorkersCompComplianceAction } from "@/app/actions/contractor-questionnaire";
import { useHub } from "@/components/hub-provider";
import { DateInput, Field, FormSubmitNotice, SecondaryButton, fieldClass } from "@/components/ui";
import type { ContractorBusinessQuestionnaire } from "@/lib/domain/contractor-questionnaire";
import type { WorkersCompComplianceStatus } from "@/lib/domain/contractor-questionnaire";
import type { AdminWorkersCompComplianceUpdate } from "@/lib/domain/contractor-workers-comp-compliance";
import {
  effectiveWorkersCompComplianceStatus,
  workersCompComplianceStatusLabel,
} from "@/lib/domain/contractor-workers-comp-compliance";

function formatUpdated(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function ContractorWorkersCompAdminSection({
  cleanerId,
  questionnaire,
}: {
  cleanerId: string;
  questionnaire: ContractorBusinessQuestionnaire;
}) {
  const hub = useHub();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<WorkersCompComplianceStatus>(
    effectiveWorkersCompComplianceStatus(questionnaire),
  );
  const [insuranceCarrier, setInsuranceCarrier] = useState(questionnaire.workersCompComplianceCarrier ?? "");
  const [policyNumber, setPolicyNumber] = useState(questionnaire.workersCompCompliancePolicyNumber ?? "");
  const [policyExpirationDate, setPolicyExpirationDate] = useState(
    questionnaire.workersCompCompliancePolicyExpirationDate ?? "",
  );
  const [certificateReceived, setCertificateReceived] = useState(
    questionnaire.workersCompComplianceCertificateReceived === true,
  );
  const [exemptionReason, setExemptionReason] = useState(questionnaire.workersCompComplianceExemptionReason ?? "");
  const [internalNotes, setInternalNotes] = useState(questionnaire.workersCompComplianceInternalNotes ?? "");

  function save(update: AdminWorkersCompComplianceUpdate) {
    setMessage(null);
    startTransition(async () => {
      const result = await updateContractorWorkersCompComplianceAction(cleanerId, update);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      hub.mergeAdminHub(result.data);
      setMessage(`Workers' comp compliance updated to ${workersCompComplianceStatusLabel(update.status).toLowerCase()}.`);
    });
  }

  return (
    <div className="border-t border-ink/10 pt-4">
      <p className="text-base font-semibold">Workers&apos; compensation compliance</p>
      <dl className="mt-3 grid gap-3 text-sm">
        <div>
          <dt className="font-medium text-ink/55">Contractor reported</dt>
          <dd>
            {questionnaire.workersCompStatus
              ? `${questionnaire.workersCompStatus === "YES" ? "Has coverage" : questionnaire.workersCompStatus === "NO" ? "No coverage" : "Unsure"}`
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink/55">Compliance status</dt>
          <dd>{workersCompComplianceStatusLabel(effectiveWorkersCompComplianceStatus(questionnaire))}</dd>
        </div>
        {questionnaire.workersCompComplianceVerifiedAt ? (
          <div>
            <dt className="font-medium text-ink/55">Last admin update</dt>
            <dd>
              {formatUpdated(questionnaire.workersCompComplianceVerifiedAt)}
              {questionnaire.workersCompComplianceVerifiedBy
                ? ` by ${questionnaire.workersCompComplianceVerifiedBy}`
                : null}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 space-y-3">
        <Field label="Set compliance status">
          <select
            className={fieldClass}
            value={status}
            onChange={(event) => setStatus(event.target.value as WorkersCompComplianceStatus)}
          >
            <option value="NEEDS_REVIEW">Needs review</option>
            <option value="COVERAGE_REQUIRED">Coverage required</option>
            <option value="EXEMPTION_VERIFIED">Exemption verified</option>
          </select>
        </Field>

        {status === "COVERAGE_REQUIRED" ? (
          <div className="space-y-3">
            <Field label="Insurance carrier">
              <input className={fieldClass} value={insuranceCarrier} onChange={(e) => setInsuranceCarrier(e.target.value)} />
            </Field>
            <Field label="Policy number (optional)">
              <input className={fieldClass} value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} />
            </Field>
            <Field label="Policy expiration date">
              <DateInput
                className={fieldClass}
                value={policyExpirationDate}
                onValueChange={setPolicyExpirationDate}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-ink/80">
              <input
                type="checkbox"
                checked={certificateReceived}
                onChange={(e) => setCertificateReceived(e.target.checked)}
              />
              Certificate of insurance received
            </label>
          </div>
        ) : null}

        {status === "EXEMPTION_VERIFIED" ? (
          <Field label="Reason for exemption">
            <textarea
              className={`${fieldClass} min-h-24 py-2`}
              value={exemptionReason}
              onChange={(e) => setExemptionReason(e.target.value)}
            />
          </Field>
        ) : null}

        <Field label="Internal notes (admin only)">
          <textarea
            className={`${fieldClass} min-h-24 py-2`}
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
          />
        </Field>

        <SecondaryButton
          type="button"
          loading={pending}
          onClick={() =>
            save({
              status,
              insuranceCarrier,
              policyNumber,
              policyExpirationDate,
              certificateReceived,
              exemptionReason,
              internalNotes,
            })
          }
        >
          Save workers&apos; comp compliance
        </SecondaryButton>
        {message ? <FormSubmitNotice message={message} /> : null}
      </div>

      {questionnaire.workersCompComplianceHistory && questionnaire.workersCompComplianceHistory.length > 0 ? (
        <div className="mt-4 rounded-2xl bg-cream/60 p-3 text-sm">
          <p className="font-semibold text-ink">Compliance history</p>
          <ul className="mt-2 space-y-2 text-ink/75">
            {questionnaire.workersCompComplianceHistory.map((entry, index) => (
              <li key={`${entry.recordedAt}-${index}`}>
                {formatUpdated(entry.recordedAt)} — {entry.summary}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

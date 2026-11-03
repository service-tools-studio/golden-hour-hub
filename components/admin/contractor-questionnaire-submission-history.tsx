"use client";

import { useMemo, useState } from "react";
import type { CleanerProfile } from "@/lib/domain/types";
import type { ContractorQuestionnaireSubmissionRecord } from "@/lib/domain/contractor-questionnaire-submission";
import { questionnaireSubmissionsForCleaner } from "@/lib/domain/contractor-questionnaire-submission";
import { SecondaryButton } from "@/components/ui";
import { formatTeamMemberForAdmin, registrationStatusLabel } from "@/lib/domain/contractor-questionnaire";

function formatSubmittedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function SnapshotSummary({ submission }: { submission: ContractorQuestionnaireSubmissionRecord }) {
  const q = submission.questionnaireSnapshot;
  return (
    <dl className="mt-3 grid gap-2 rounded-2xl bg-cream/50 p-3 text-sm">
      <div>
        <dt className="font-medium text-ink/55">Business name</dt>
        <dd>{q.businessDisplayName}</dd>
      </div>
      <div>
        <dt className="font-medium text-ink/55">Owner</dt>
        <dd>{q.ownerLegalName}</dd>
      </div>
      <div>
        <dt className="font-medium text-ink/55">Structure</dt>
        <dd>{registrationStatusLabel(q.registrationStatus)}</dd>
      </div>
      {q.teamMembers && q.teamMembers.length > 0 && q.hasAdditionalWorkers ? (
        <div>
          <dt className="font-medium text-ink/55">Team</dt>
          <dd className="space-y-1">
            {q.teamMembers.map((member, index) => (
              <p key={index}>{formatTeamMemberForAdmin(member)}</p>
            ))}
          </dd>
        </div>
      ) : null}
      <div>
        <dt className="font-medium text-ink/55">Acknowledgment version</dt>
        <dd>{submission.acknowledgmentVersion}</dd>
      </div>
    </dl>
  );
}

export function ContractorQuestionnaireSubmissionHistory({
  cleaner,
  submissions,
}: {
  cleaner: CleanerProfile;
  submissions: ContractorQuestionnaireSubmissionRecord[];
}) {
  const history = useMemo(
    () => questionnaireSubmissionsForCleaner(submissions, cleaner.cleanerId),
    [submissions, cleaner.cleanerId],
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (history.length === 0) {
    return (
      <div className="border-t border-ink/10 pt-4">
        <p className="text-base font-semibold">Submission history</p>
        <p className="mt-2 text-sm text-ink/65">No submitted versions on file yet.</p>
      </div>
    );
  }

  return (
    <div className="border-t border-ink/10 pt-4 space-y-3">
      <p className="text-base font-semibold">Submission history</p>
      <p className="text-sm text-ink/65">Historical records are read-only and preserved for audit review.</p>
      <ul className="space-y-3">
        {history.map((submission) => {
          const expanded = expandedId === submission.submissionId;
          return (
            <li key={submission.submissionId} className="rounded-2xl bg-cream/40 p-3 ring-1 ring-ink/8">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="text-sm">
                  <p className="font-semibold text-ink">
                    Version {submission.submissionVersion} · {formatSubmittedAt(submission.submittedAt)}
                  </p>
                  <p className="mt-1 text-ink/70">Signed by {submission.electronicSignature}</p>
                  <p className="text-ink/60">Acknowledgment on file · ID {submission.submissionId.slice(0, 8)}…</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <SecondaryButton type="button" onClick={() => setExpandedId(expanded ? null : submission.submissionId)}>
                    {expanded ? "Hide details" : "View submission"}
                  </SecondaryButton>
                  <a
                    className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-ink ring-1 ring-ink/15"
                    href={`/api/admin/business-questionnaire-submissions/${cleaner.cleanerId}/${submission.submissionId}/pdf`}
                  >
                    Download PDF
                  </a>
                </div>
              </div>
              {expanded ? <SnapshotSummary submission={submission} /> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

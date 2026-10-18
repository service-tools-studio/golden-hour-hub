"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useHub } from "@/components/hub-provider";
import { type CleaningOrigin, withOrigin } from "@/components/jobs/origin";
import { Notice, PageHeader, Screen } from "@/components/ui";
import { availabilityAgainstSpan, cleaningTimeSpan } from "@/lib/domain/availability";
import { personName } from "@/lib/domain/cleaners";
import { hourWindowLabel } from "@/lib/format";

export function AddCleanerView({ jobId, from }: { jobId: string; from?: CleaningOrigin }) {
  const hub = useHub();
  const router = useRouter();
  const [navigating, setNavigating] = useState(false);
  const job = hub.jobs.find((item) => item.jobId === jobId && item.status !== "CANCELED");

  if (!job) {
    return (
      <Screen>
        <PageHeader title="Add cleaner" crumb={{ href: "/admin", label: "Dashboard" }} />
        <div className="px-5 pt-4">
          <Notice>That cleaning could not be found.</Notice>
        </div>
      </Screen>
    );
  }

  const taken = new Set([
    ...(job.draftCleanerIds ?? []),
    ...hub.assignments
      .filter(
        (assignment) =>
          assignment.jobId === job.jobId &&
          assignment.status !== "CANCELED" &&
          assignment.status !== "EXPIRED_JOB_FILLED",
      )
      .map((assignment) => assignment.cleanerId),
  ]);
  const choices = hub.cleaners.filter((cleaner) => cleaner.status === "ACTIVE" && !taken.has(cleaner.cleanerId));
  const duration = job.expectedDurationMinutes ?? 240;
  const span =
    job.arrivalWindowStart && job.arrivalWindowEnd
      ? cleaningTimeSpan(job.arrivalWindowStart, job.arrivalWindowEnd, duration)
      : null;

  function add(cleanerId: string) {
    if (navigating) return;
    const result = hub.addJobCleaner(jobId, cleanerId);
    if (!result.ok) {
      if (result.message) hub.flash(result.message);
      return;
    }
    setNavigating(true);
    if (result.message) hub.flashLoading(result.message);
    router.push(withOrigin(`/admin/jobs/${jobId}/edit`, from, { cleaner: cleanerId }));
  }

  return (
    <Screen>
      <PageHeader
        title="Add cleaner"
        subtitle={job.snapshot.customerDisplayName}
        crumb={{ href: withOrigin(`/admin/jobs/${job.jobId}`, from), label: "Cleaning" }}
      />
      <div className="space-y-2 px-5 pt-4">
        {choices.length === 0 ? <p className="text-sm text-ink/70">Every active cleaner is already on this cleaning.</p> : null}
        {choices.map((cleaner) => {
          const pills = availabilityAgainstSpan(
            hub.availability
              .filter((window) => window.cleanerId === cleaner.cleanerId && window.date === job.date)
              .map((window) => ({ start: window.start, end: window.end })),
            span,
          );
          return (
            <button
              key={cleaner.cleanerId}
              type="button"
              disabled={navigating}
              onClick={() => add(cleaner.cleanerId)}
              className="block min-h-12 w-full rounded-2xl bg-white px-4 py-3 text-left disabled:opacity-70"
            >
              <span className="block text-base font-semibold">{personName(cleaner.firstName, cleaner.lastName)}</span>
              {pills.length > 0 ? (
                <span className="mt-2 flex flex-wrap gap-2">
                  {pills.map((pill) => (
                    <span
                      key={`${pill.start}-${pill.end}`}
                      className={`rounded-full px-3 py-1 text-sm font-semibold ${pill.fits ? "bg-mint text-ink" : "bg-ink/10 text-ink/70"}`}
                    >
                      {hourWindowLabel(pill.start, pill.end)}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="mt-1 block text-sm text-ink/55">No availability this day</span>
              )}
            </button>
          );
        })}
      </div>
    </Screen>
  );
}

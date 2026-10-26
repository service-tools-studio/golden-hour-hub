"use client";

import { useState } from "react";
import { ActionSheet } from "@/components/action-sheet";
import { fullAddress } from "@/components/address-link";
import { type CalendarEvent, googleCalendarUrl, icsDownloadPath, outlookCalendarUrl } from "@/lib/calendar";
import { calculateBlockedRange } from "@/lib/domain/scheduling";
import type { Job, JobAssignment } from "@/lib/domain/types";
import { cleanerServiceLabel, customerFirstNameForCleaner, formatArrival } from "@/lib/format";

export function cleaningCalendarEvent(job: Job, assignment: JobAssignment): CalendarEvent {
  const range = calculateBlockedRange({
    date: assignment.serviceDate,
    arrivalWindowStart: assignment.arrivalWindowStart,
    arrivalWindowEnd: assignment.arrivalWindowEnd,
    expectedDurationMinutes: assignment.expectedDurationMinutes,
  });
  const notes = [
    `Start time: ${formatArrival(assignment.arrivalWindowStart, assignment.arrivalWindowEnd)}`,
    job.snapshot.preferences ? `Preferences: ${job.snapshot.preferences}` : "",
    job.specialInstructions ? `Instructions: ${job.specialInstructions}` : "",
  ].filter(Boolean);
  return {
    uid: `${assignment.assignmentId}@goldenhourhub`,
    title: `Golden Hour: ${customerFirstNameForCleaner(job.snapshot)} – ${cleanerServiceLabel(job.serviceType)}`,
    start: range.startUtc,
    end: range.endUtc,
    location: fullAddress(job.snapshot),
    notes: notes.join("\n"),
  };
}

export function AddToCalendarButton({ job, assignment }: { job: Job; assignment: JobAssignment }) {
  const [open, setOpen] = useState(false);
  const event = cleaningCalendarEvent(job, assignment);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-ink/20 bg-white text-base font-semibold text-ink"
      >
        <span aria-hidden="true">🗓️</span>
        Add to calendar
      </button>
      {open ? (
        <ActionSheet
          title="Add to calendar"
          detail={event.title.replace(/^Golden Hour: /, "")}
          onClose={() => setOpen(false)}
          actions={[
            { label: "Phone calendar", href: icsDownloadPath(event) },
            { label: "Google Calendar", href: googleCalendarUrl(event), newTab: true },
            { label: "Outlook", href: outlookCalendarUrl(event), newTab: true },
          ]}
        />
      ) : null}
    </>
  );
}

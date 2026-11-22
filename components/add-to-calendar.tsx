"use client";

import { useState } from "react";
import { ActionSheet } from "@/components/action-sheet";
import { googleCalendarUrl, icsDownloadPath, outlookCalendarUrl } from "@/lib/calendar";
import { buildCleanerAssignmentCalendarEvent } from "@/lib/cleaner/calendar-event";
import type { Job, JobAssignment } from "@/lib/domain/types";

export { buildCleanerAssignmentCalendarEvent as cleaningCalendarEvent } from "@/lib/cleaner/calendar-event";

export function AddToCalendarButton({ job, assignment }: { job: Job; assignment: JobAssignment }) {
  const [open, setOpen] = useState(false);
  const event = buildCleanerAssignmentCalendarEvent(job, assignment);
  if (!event) return null;
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
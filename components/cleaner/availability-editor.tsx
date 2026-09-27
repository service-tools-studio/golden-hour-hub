"use client";

import { useState } from "react";
import { useHub } from "@/components/hub-provider";
import { Card, Notice, PageHeader, Screen } from "@/components/ui";
import { copyWeekWindows, windowsInWeek } from "@/lib/domain/availability";
import { validateAvailabilityWindows } from "@/lib/domain/scheduling";
import { addDays, dayOfWeek, eachDate, formatWeekRange, nextAvailabilityWeek } from "@/lib/domain/time";
import { formatArrival, formatLongDate } from "@/lib/format";
import type { AvailabilityWindow } from "@/lib/domain/types";

export function AvailabilityEditor() {
  const hub = useHub();
  const cleaner = hub.cleaners.find((item) => item.cleanerId === hub.cleanerId);
  const week = nextAvailabilityWeek(hub.today);
  const [draft, setDraft] = useState<AvailabilityWindow[]>(() =>
    cleaner ? windowsInWeek(hub.availability, cleaner.cleanerId, week.weekStart) : [],
  );
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"error" | "ok">("error");
  if (!cleaner) return null;
  const profile = cleaner;

  const days = eachDate(week.weekStart, week.weekEnd);
  const submitted = hub.submissions.some(
    (submission) => submission.cleanerId === cleaner.cleanerId && submission.weekStart === week.weekStart,
  );
  const confirmed = hub.assignments.filter(
    (assignment) =>
      assignment.cleanerId === cleaner.cleanerId &&
      assignment.status === "CONFIRMED" &&
      assignment.serviceDate >= week.weekStart &&
      assignment.serviceDate <= week.weekEnd,
  );

  function setDay(date: string, available: boolean) {
    setDraft((current) => {
      const rest = current.filter((window) => window.date !== date);
      if (!available) return rest;
      return [
        ...rest,
        {
          availabilityId: `draft-${date}-0`,
          cleanerId: profile.cleanerId,
          date,
          start: "08:00",
          end: "16:00",
        },
      ];
    });
  }

  function updateWindow(id: string, patch: Partial<AvailabilityWindow>) {
    setDraft((current) => current.map((window) => (window.availabilityId === id ? { ...window, ...patch } : window)));
  }

  function addWindow(date: string) {
    setDraft((current) => [
      ...current,
      {
        availabilityId: `draft-${date}-${current.length}`,
        cleanerId: profile.cleanerId,
        date,
        start: "13:00",
        end: "17:00",
      },
    ]);
  }

  function copyLastWeek() {
    let nextId = 0;
    const copied = copyWeekWindows(
      hub.availability,
      profile.cleanerId,
      addDays(week.weekStart, -7),
      week.weekStart,
      () => `copy-${nextId++}`,
    );
    setDraft(copied);
    setTone("ok");
    setMessage(copied.length === 0 ? "Last week had no availability to copy." : "Last week was copied. Review it, then submit.");
  }

  function submit() {
    const check = validateAvailabilityWindows(
      draft.map((window) => ({ date: window.date, start: window.start, end: window.end })),
    );
    if (!check.ok) {
      setTone("error");
      setMessage(check.message);
      return;
    }
    const result = hub.submitAvailability(profile.cleanerId, week.weekStart, draft);
    setTone(result.ok ? "ok" : "error");
    setMessage(result.ok ? "Availability submitted." : result.message);
  }

  return (
    <Screen>
      <PageHeader title="Availability" subtitle={formatWeekRange(week.weekStart, week.weekEnd)} />
      <div className="space-y-3 px-5 pt-4">
        <p className="text-sm text-ink/70">{submitted ? "Submitted. You can still edit this week." : "Due by Sunday."}</p>
        {confirmed.map((assignment) => {
          const job = hub.jobs.find((item) => item.jobId === assignment.jobId);
          return (
            <Notice key={assignment.assignmentId} tone="ok">
              Confirmed cleaning {formatLongDate(assignment.serviceDate)}
              {job ? ` for ${job.snapshot.customerDisplayName}` : ""} ·{" "}
              {formatArrival(assignment.arrivalWindowStart, assignment.arrivalWindowEnd)}. Keep this time available.
            </Notice>
          );
        })}
        <button type="button" onClick={copyLastWeek} className="min-h-12 w-full rounded-2xl bg-white text-base font-semibold ring-1 ring-ink/10">
          Copy Last Week
        </button>
        {days.map((date) => {
          const windows = draft.filter((window) => window.date === date).sort((a, b) => a.start.localeCompare(b.start));
          const available = windows.length > 0;
          return (
            <Card key={date}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold capitalize">{dayOfWeek(date).toLowerCase()}</p>
                  <p className="text-sm text-ink/60">{formatLongDate(date)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDay(date, !available)}
                  className={`min-h-11 rounded-full px-3 text-sm font-semibold ${available ? "bg-mint text-ink" : "bg-cream text-ink/70"}`}
                >
                  {available ? "Available" : "Not available"}
                </button>
              </div>
              {windows.map((window) => (
                <div key={window.availabilityId} className="mt-3 grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                  <input
                    type="time"
                    value={window.start}
                    onChange={(event) => updateWindow(window.availabilityId, { start: event.target.value })}
                    className="min-h-12 rounded-2xl border border-ink/15 bg-cream px-2"
                  />
                  <input
                    type="time"
                    value={window.end === "24:00" ? "00:00" : window.end}
                    onChange={(event) => updateWindow(window.availabilityId, { end: event.target.value })}
                    className="min-h-12 rounded-2xl border border-ink/15 bg-cream px-2"
                  />
                  <button
                    type="button"
                    className="min-h-12 px-2 text-sm font-semibold text-ink/60"
                    onClick={() => setDraft((current) => current.filter((item) => item.availabilityId !== window.availabilityId))}
                  >
                    Remove
                  </button>
                </div>
              ))}
              {available ? (
                <button type="button" onClick={() => addWindow(date)} className="mt-3 min-h-11 text-sm font-semibold text-ink">
                  + Add Another Time
                </button>
              ) : null}
            </Card>
          );
        })}
        {message ? <Notice tone={tone}>{message}</Notice> : null}
        <button type="button" onClick={submit} className="min-h-14 w-full rounded-2xl bg-ink text-base font-semibold text-cream">
          Submit Availability
        </button>
      </div>
    </Screen>
  );
}

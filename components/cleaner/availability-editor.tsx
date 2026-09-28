"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useHub } from "@/components/hub-provider";
import { Card, Notice, PageHeader, Screen } from "@/components/ui";
import { copyWeekWindows, mergeAdjacentWindows, windowsInWeek } from "@/lib/domain/availability";
import { toAssignmentSchedule, validateAvailabilityEdit, validateAvailabilityWindows } from "@/lib/domain/scheduling";
import { addDays, dayOfWeek, eachDate, formatHm, formatTimeLabel, formatWeekRange, nextAvailabilityWeek } from "@/lib/domain/time";
import { formatArrival, formatLongDate } from "@/lib/format";
import type { AvailabilityWindow } from "@/lib/domain/types";

function useUnsavedNavigation(active: boolean, blocked: () => boolean, onBlock: (href: string) => void) {
  const activeRef = useRef(active);
  const blockedRef = useRef(blocked);
  const onBlockRef = useRef(onBlock);
  activeRef.current = active;
  blockedRef.current = blocked;
  onBlockRef.current = onBlock;

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!activeRef.current || !blockedRef.current()) return;
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const raw = anchor.getAttribute("href");
      if (!raw || raw.startsWith("#")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const next = `${url.pathname}${url.search}`;
      if (next === `${window.location.pathname}${window.location.search}`) return;
      event.preventDefault();
      event.stopPropagation();
      onBlockRef.current(next);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
}

function windowSignature(windows: AvailabilityWindow[]): string {
  return [...windows]
    .map((window) => `${window.date}|${window.start}|${window.end}`)
    .sort()
    .join("\n");
}

function clockParts(time: string): { hour: number; minute: number; suffix: "AM" | "PM" } {
  const normalized = time === "24:00" ? "00:00" : time;
  const [hourValue, minute] = normalized.split(":").map(Number);
  return {
    hour: hourValue % 12 === 0 ? 12 : hourValue % 12,
    minute,
    suffix: hourValue >= 12 ? "PM" : "AM",
  };
}

function clockValue(hour: number, minute: number, suffix: "AM" | "PM"): string {
  return formatHm((hour % 12) + (suffix === "PM" ? 12 : 0), minute);
}

function minuteChoices(minute: number): number[] {
  const choices = new Set<number>([minute]);
  for (let value = 0; value < 60; value += 5) choices.add(value);
  return [...choices].sort((left, right) => left - right);
}

function ClockField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<{ hour?: number; minute?: number; suffix?: "AM" | "PM" }>({});
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const clock = value ? clockParts(value) : null;
  const hour = clock?.hour ?? pending.hour;
  const minute = clock?.minute ?? pending.minute;
  const suffix = clock?.suffix ?? pending.suffix;
  const short = label.startsWith("End") ? "End" : "Start";
  function update(patch: { hour?: number; minute?: number; suffix?: "AM" | "PM" }) {
    if (clock) {
      const next = { ...clock, ...patch };
      onChange(clockValue(next.hour, next.minute, next.suffix));
      return;
    }
    const next = { ...pendingRef.current, ...patch };
    pendingRef.current = next;
    setPending(next);
    if (next.hour !== undefined && next.minute !== undefined && next.suffix) {
      onChange(clockValue(next.hour, next.minute, next.suffix));
    }
  }
  const preview =
    hour !== undefined && minute !== undefined && suffix
      ? formatTimeLabel(clockValue(hour, minute, suffix))
      : [hour ?? "–", ":", minute === undefined ? "––" : String(minute).padStart(2, "0"), suffix ? ` ${suffix}` : ""].join("");
  function choiceClass(selected: boolean) {
    return `min-h-12 rounded-2xl text-base font-semibold ${selected ? "bg-ink text-cream" : "bg-cream text-ink"}`;
  }
  return (
    <>
      <button
        type="button"
        aria-label={value ? `${label} ${formatTimeLabel(value)}` : `Choose ${label}`}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={`flex min-h-14 w-full items-center justify-center whitespace-nowrap rounded-2xl border border-ink/15 bg-cream px-2 text-base font-semibold ${
          value ? "text-ink" : "text-ink/40"
        }`}
      >
        {value ? formatTimeLabel(value) : short}
      </button>
      {open
        ? createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className="flex max-h-[88dvh] min-h-0 w-full max-w-md flex-col rounded-t-3xl bg-white shadow-[0_8px_30px_rgba(51,51,51,0.16)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="overflow-y-auto px-5 pt-5">
              <p className="text-sm font-medium text-ink/60">{label}</p>
              <p className="mt-1 text-2xl font-semibold">{hour === undefined && minute === undefined && !suffix ? short : preview}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {(["AM", "PM"] as const).map((option) => (
                  <button key={option} type="button" className={choiceClass(suffix === option)} onClick={() => update({ suffix: option })}>
                    {option}
                  </button>
                ))}
              </div>
              <p className="mt-4 text-sm font-medium text-ink/60">Hour</p>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {Array.from({ length: 12 }, (_, index) => index + 1).map((option) => (
                  <button key={option} type="button" className={choiceClass(hour === option)} onClick={() => update({ hour: option })}>
                    {option}
                  </button>
                ))}
              </div>
              <p className="mt-4 text-sm font-medium text-ink/60">Minute</p>
              <div className="mt-2 grid grid-cols-4 gap-2 pb-3">
                {minuteChoices(minute ?? 0).map((option) => (
                  <button key={option} type="button" className={choiceClass(minute === option)} onClick={() => update({ minute: option })}>
                    {String(option).padStart(2, "0")}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
              <button type="button" className="min-h-14 w-full rounded-2xl bg-ink text-base font-semibold text-cream" onClick={() => setOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )
        : null}
    </>
  );
}

export function AvailabilityEditor() {
  const hub = useHub();
  const router = useRouter();
  const cleaner = hub.cleaners.find((item) => item.cleanerId === hub.cleanerId);
  const week = nextAvailabilityWeek(hub.today);
  const [draft, setDraft] = useState<AvailabilityWindow[]>(() =>
    cleaner ? mergeAdjacentWindows(windowsInWeek(hub.availability, cleaner.cleanerId, week.weekStart)) : [],
  );
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"error" | "ok">("error");
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const saved = cleaner ? mergeAdjacentWindows(windowsInWeek(hub.availability, cleaner.cleanerId, week.weekStart)) : [];
  const dirty = windowSignature(draft) !== windowSignature(saved);
  useUnsavedNavigation(Boolean(cleaner), () => dirty, setLeaveHref);
  useEffect(() => {
    if (tone !== "error" || !message || !cleaner) return;
    const outside = hub.availability
      .filter(
        (window) =>
          window.cleanerId === cleaner.cleanerId && (window.date < week.weekStart || window.date > week.weekEnd),
      )
      .map((window) => ({ date: window.date, start: window.start, end: window.end }));
    const check = validateAvailabilityEdit({
      newWindows: [...outside, ...draft.map((window) => ({ date: window.date, start: window.start, end: window.end }))],
      confirmedAssignments: hub.assignments
        .filter((assignment) => assignment.cleanerId === cleaner.cleanerId && assignment.status === "CONFIRMED")
        .map(toAssignmentSchedule),
    });
    setMessage(check.ok ? null : check.message);
  }, [cleaner, draft, hub.assignments, hub.availability, message, tone, week.weekEnd, week.weekStart]);
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
      return mergeAdjacentWindows([
        ...rest,
        {
          availabilityId: `draft-${date}-0`,
          cleanerId: profile.cleanerId,
          date,
          start: "",
          end: "",
        },
      ]);
    });
  }

  function updateWindow(id: string, patch: Partial<AvailabilityWindow>) {
    setDraft((current) =>
      mergeAdjacentWindows(current.map((window) => (window.availabilityId === id ? { ...window, ...patch } : window))),
    );
  }

  function addWindow(date: string) {
    setDraft((current) =>
      mergeAdjacentWindows([
        ...current,
        {
          availabilityId: `draft-${date}-${current.length}`,
          cleanerId: profile.cleanerId,
          date,
          start: "",
          end: "",
        },
      ]),
    );
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
    setDraft(mergeAdjacentWindows(copied));
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
      return false;
    }
    const result = hub.submitAvailability(profile.cleanerId, week.weekStart, draft);
    setTone(result.ok ? "ok" : "error");
    setMessage(result.ok ? "Availability submitted." : result.message);
    return result.ok;
  }

  function submitAndLeave() {
    const href = leaveHref;
    if (!submit()) {
      setLeaveHref(null);
      return;
    }
    setLeaveHref(null);
    hub.flash("Availability submitted.");
    if (href) router.push(href);
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
          const windows = draft.filter((window) => window.date === date).sort((a, b) => {
            if (!a.start && !b.start) return 0;
            if (!a.start) return 1;
            if (!b.start) return -1;
            return a.start.localeCompare(b.start);
          });
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
                  <ClockField
                    label="Start time"
                    value={window.start}
                    onChange={(start) => updateWindow(window.availabilityId, { start })}
                  />
                  <ClockField
                    label="End time"
                    value={window.end}
                    onChange={(end) => updateWindow(window.availabilityId, { end })}
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
      {leaveHref ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-5 pb-28" onClick={() => setLeaveHref(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="availability-leave-title"
            className="w-full max-w-md rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgba(51,51,51,0.16)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="availability-leave-title" className="text-lg font-semibold">
              Submit availability?
            </h2>
            <p className="mt-1 text-sm leading-5 text-ink/70">This week has changes that are not submitted yet.</p>
            <div className="mt-4 space-y-2">
              <button type="button" onClick={submitAndLeave} className="min-h-12 w-full rounded-2xl bg-ink text-base font-semibold text-cream">
                Submit availability
              </button>
              <button type="button" onClick={() => setLeaveHref(null)} className="min-h-12 w-full rounded-2xl bg-cream text-base font-semibold text-ink">
                Keep editing
              </button>
              <button
                type="button"
                onClick={() => {
                  const href = leaveHref;
                  setLeaveHref(null);
                  if (href) router.push(href);
                }}
                className="min-h-12 w-full text-base font-semibold text-ink/70"
              >
                Throw away changes
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Screen>
  );
}

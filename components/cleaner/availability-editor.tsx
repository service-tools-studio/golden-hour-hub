"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { UnsavedChangesDialog, useUnsavedNavigation } from "@/components/unsaved-changes";
import { useRouter } from "next/navigation";
import { useHub } from "@/components/hub-provider";
import { Card, Notice, PageHeader, Screen } from "@/components/ui";
import { copyWeekWindows, mergeAdjacentWindows, windowsInWeek } from "@/lib/domain/availability";
import { toAssignmentSchedule, validateAvailabilityEdit, validateAvailabilityWindows } from "@/lib/domain/scheduling";
import { addDays, dayOfWeek, eachDate, formatHm, formatTimeLabel, formatWeekRange, nextAvailabilityWeek } from "@/lib/domain/time";
import { formatArrival, formatLongDate } from "@/lib/format";
import type { AvailabilityWindow } from "@/lib/domain/types";

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

const WHEEL_ITEM = 36;
const HOURS = Array.from({ length: 12 }, (_, index) => index + 1);

function TimeButton({
  label,
  value,
  open,
  onClick,
}: {
  label: string;
  value: string;
  open: boolean;
  onClick: () => void;
}) {
  const short = label.startsWith("End") ? "End" : "Start";
  return (
    <button
      type="button"
      aria-label={value ? `${label} ${formatTimeLabel(value)}` : `Choose ${label}`}
      aria-expanded={open}
      onClick={onClick}
      className={`flex min-h-14 w-full items-center justify-center whitespace-nowrap rounded-2xl px-2 text-base font-semibold ${
        open ? "bg-gold text-ink" : `border border-ink/15 bg-cream ${value ? "text-ink" : "text-ink/40"}`
      }`}
    >
      {value ? formatTimeLabel(value) : short}
    </button>
  );
}

function WindowTimes({
  start,
  end,
  onStart,
  onEnd,
  onRemove,
}: {
  start: string;
  end: string;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState<"start" | "end" | null>(null);

  function toggle(field: "start" | "end") {
    if (open === field) {
      setOpen(null);
      return;
    }
    if (field === "start" && !start) onStart("08:00");
    if (field === "end" && !end) onEnd("17:00");
    setOpen(field);
  }

  const value = open === "end" ? end || "17:00" : start || "08:00";

  return (
    <div className="mt-3">
      <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
        <TimeButton label="Start time" value={start} open={open === "start"} onClick={() => toggle("start")} />
        <TimeButton label="End time" value={end} open={open === "end"} onClick={() => toggle("end")} />
        <button type="button" className="min-h-12 px-2 text-sm font-semibold text-ink/60" onClick={onRemove}>
          Remove
        </button>
      </div>
      {open ? (
        <ClockWheel
          value={value}
          onChange={(next) => (open === "start" ? onStart(next) : onEnd(next))}
        />
      ) : null}
    </div>
  );
}

function ClockWheel({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const clock = clockParts(value);
  const minutes = minuteChoices(clock.minute);

  function choose(patch: Partial<{ hour: number; minute: number; suffix: "AM" | "PM" }>) {
    const next = { ...clock, ...patch };
    onChange(clockValue(next.hour, next.minute, next.suffix));
  }

  return (
    <div className="relative mt-3">
      <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-9 -translate-y-1/2 rounded-lg bg-ink/8" />
      <div className="flex gap-2">
        <TimeWheel
          label="Hour"
          options={HOURS.map((hour) => ({ value: String(hour), label: String(hour) }))}
          value={String(clock.hour)}
          onChange={(next) => choose({ hour: Number(next) })}
        />
        <TimeWheel
          label="Minute"
          options={minutes.map((minute) => ({ value: String(minute), label: String(minute).padStart(2, "0") }))}
          value={String(clock.minute)}
          onChange={(next) => choose({ minute: Number(next) })}
        />
        <TimeWheel
          label="AM or PM"
          options={[
            { value: "AM", label: "AM" },
            { value: "PM", label: "PM" },
          ]}
          value={clock.suffix}
          onChange={(next) => choose({ suffix: next === "PM" ? "PM" : "AM" })}
        />
      </div>
    </div>
  );
}

function TimeWheel({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const optionsRef = useRef(options);
  onChangeRef.current = onChange;
  valueRef.current = value;
  optionsRef.current = options;

  const optionKey = options.map((option) => option.value).join(",");
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const index = Math.max(0, options.findIndex((option) => option.value === value));
    const top = index * WHEEL_ITEM;
    if (Math.abs(node.scrollTop - top) > 1) node.scrollTop = top;
  }, [optionKey, options, value]);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    function commit() {
      if (!node) return;
      const index = Math.round(node.scrollTop / WHEEL_ITEM);
      const next = optionsRef.current[Math.max(0, Math.min(optionsRef.current.length - 1, index))];
      if (next && next.value !== valueRef.current) onChangeRef.current(next.value);
    }
    node.addEventListener("scrollend", commit);
    return () => node.removeEventListener("scrollend", commit);
  }, []);

  return (
    <div className="relative h-[180px] min-w-0 flex-1">
      <div
        ref={scroller}
        aria-label={label}
        className="h-full snap-y snap-mandatory overflow-y-auto [scrollbar-width:none] [mask-image:linear-gradient(transparent,black_28%,black_72%,transparent)] [&::-webkit-scrollbar]:hidden"
      >
        <div style={{ height: WHEEL_ITEM * 2 }} />
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-selected={option.value === value}
            onClick={() => onChange(option.value)}
            className={`relative z-20 flex h-9 w-full snap-center items-center justify-center text-lg ${
              option.value === value ? "font-semibold text-ink" : "text-ink/35"
            }`}
          >
            {option.label}
          </button>
        ))}
        <div style={{ height: WHEEL_ITEM * 2 }} />
      </div>
    </div>
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

  function copyDayForward(date: string) {
    const later = days.filter((day) => day > date);
    if (later.length === 0) return;
    setDraft((current) => {
      const source = current.filter((window) => window.date === date);
      const rest = current.filter((window) => window.date <= date);
      const copied = later.flatMap((day) =>
        source.map((window, index) => ({
          ...window,
          availabilityId: `copy-${day}-${index}-${current.length}`,
          date: day,
        })),
      );
      return mergeAdjacentWindows([...rest, ...copied]);
    });
    setMessage(null);
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
                <WindowTimes
                  key={window.availabilityId}
                  start={window.start}
                  end={window.end}
                  onStart={(start) => updateWindow(window.availabilityId, { start })}
                  onEnd={(end) => updateWindow(window.availabilityId, { end })}
                  onRemove={() => setDraft((current) => current.filter((item) => item.availabilityId !== window.availabilityId))}
                />
              ))}
              {available ? (
                <div className="mt-3 flex items-center justify-between gap-3">
                  <button type="button" onClick={() => addWindow(date)} className="min-h-11 text-sm font-semibold text-ink">
                    + Add Another Time
                  </button>
                  {date < week.weekEnd ? (
                    <button type="button" onClick={() => copyDayForward(date)} className="min-h-11 text-sm font-semibold text-ink">
                      copy thru end of week
                    </button>
                  ) : null}
                </div>
              ) : null}
            </Card>
          );
        })}
        {message ? <Notice tone={tone}>{message}</Notice> : null}
        <button type="button" onClick={submit} className="min-h-14 w-full rounded-2xl bg-ink text-base font-semibold text-cream">
          Submit Availability
        </button>
      </div>
      <UnsavedChangesDialog
        open={leaveHref !== null}
        onSave={submitAndLeave}
        onDiscard={() => {
          const href = leaveHref;
          setLeaveHref(null);
          if (href) router.push(href);
        }}
        onDismiss={() => setLeaveHref(null)}
      />
    </Screen>
  );
}

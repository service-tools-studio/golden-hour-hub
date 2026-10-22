"use client";

import { useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { UnsavedChangesDialog, useUnsavedNavigation } from "@/components/unsaved-changes";
import { useHub } from "@/components/hub-provider";
import { useHubSyncBlocker } from "@/components/hub-sync";
import { Card, Notice, PrimaryButton } from "@/components/ui";
import {
  OPEN_DAY_END,
  OPEN_DAY_START,
  copyWeekWindows,
  mergeAdjacentWindows,
  windowsInWeek,
} from "@/lib/domain/availability";
import {
  assignmentUncoveredByAvailability,
  toAssignmentSchedule,
  validateAvailabilityEdit,
  validateAvailabilityWindows,
} from "@/lib/domain/scheduling";
import {
  addDays,
  dayOfWeek,
  eachDate,
  editableAvailabilityWeeks,
  formatHm,
  formatTimeLabel,
  formatMonthDay,
  formatWeekRange,
  isValidLocalTime,
  nextAvailabilityWeek,
  normalizeAvailabilityWeekStart,
} from "@/lib/domain/time";
import { customerFirstNameForCleaner, formatArrival, formatLongDate } from "@/lib/format";
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
  const text = value ? formatTimeLabel(value) : short;
  return (
    <button
      type="button"
      aria-label={value ? `${label} ${text}` : `Choose ${label}`}
      aria-expanded={open}
      onClick={onClick}
      className={`flex min-h-14 w-full items-center justify-center whitespace-nowrap rounded-2xl px-2 text-base font-semibold ${
        open ? "bg-gold text-ink" : `border border-ink/15 bg-cream ${value ? "text-ink" : "text-ink/40"}`
      }`}
    >
      {text}
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
  const [settingHours, setSettingHours] = useState(false);
  const allDay = start === OPEN_DAY_START && end === OPEN_DAY_END;

  function toggle(field: "start" | "end") {
    if (open === field) {
      setOpen(null);
      return;
    }
    if (field === "start" && !start) onStart("08:00");
    if (field === "end" && !end) onEnd("17:00");
    setOpen(field);
  }

  function setHours() {
    setSettingHours(true);
    onStart("08:00");
    onEnd("23:55");
  }

  if (allDay && !settingHours) {
    return (
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={setHours}
          className="flex min-h-12 min-w-0 flex-1 items-center whitespace-nowrap rounded-2xl bg-mint/60 px-4 text-left text-base font-semibold"
        >
          All day
        </button>
        <button
          type="button"
          onClick={setHours}
          className="min-h-12 shrink-0 whitespace-nowrap px-1 text-sm font-semibold text-ink underline decoration-gold decoration-2 underline-offset-4"
        >
          Set hours
        </button>
        <button type="button" className="min-h-12 shrink-0 px-1 text-sm font-semibold text-ink/60" onClick={onRemove}>
          Remove
        </button>
      </div>
    );
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
        <ClockWheel value={value} onChange={(next) => (open === "start" ? onStart(next) : onEnd(next))} />
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

export type AvailabilityWeekEditorHandle = {
  isDirty: () => boolean;
  save: () => Promise<boolean>;
};

export function AvailabilityWeekEditor({
  cleanerId,
  weekStart: weekStartProp,
  onWeekStartChange,
  variant = "cleaner",
  embedded = false,
  onDirtyChange,
  ref,
}: {
  cleanerId: string;
  weekStart: string;
  onWeekStartChange: (weekStart: string) => void;
  variant?: "cleaner" | "admin";
  embedded?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  ref?: React.Ref<AvailabilityWeekEditorHandle>;
}) {
  const hub = useHub();
  const cleaner = hub.cleaners.find((item) => item.cleanerId === cleanerId);
  const editableWeeks = editableAvailabilityWeeks(hub.today);
  const weekStart = normalizeAvailabilityWeekStart(hub.today, weekStartProp);
  const week = editableWeeks.find((item) => item.weekStart === weekStart) ?? editableWeeks[0];
  const dueWeekStart = nextAvailabilityWeek(hub.today).weekStart;
  const availabilityDueSunday = addDays(dueWeekStart, -1);
  const [draft, setDraft] = useState<AvailabilityWindow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"error" | "ok">("error");
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const [conflictPrompt, setConflictPrompt] = useState<{ detail: string; onConfirm: () => void } | null>(null);
  const [switchingToWeek, setSwitchingToWeek] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const conflictTitleId = useId();
  const editBaselineRef = useRef<AvailabilityWindow[]>([]);
  const savedWeekWindows = useMemo(
    () =>
      cleaner ? mergeAdjacentWindows(windowsInWeek(hub.availability, cleaner.cleanerId, week.weekStart)) : [],
    [cleaner, hub.availability, week.weekStart],
  );
  const savedWeekSignature = useMemo(() => windowSignature(savedWeekWindows), [savedWeekWindows]);
  const dirty = windowSignature(draft) !== savedWeekSignature;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useUnsavedNavigation(Boolean(cleaner) && !embedded, () => dirty, setLeaveHref);
  useHubSyncBlocker(() => dirty && !embedded);

  useEffect(() => {
    if (!cleaner) return;
    editBaselineRef.current = savedWeekWindows;
    setDraft(savedWeekWindows);
    setMessage(null);
    setTone("error");
    setConflictPrompt(null);
  }, [cleaner, week.weekStart, savedWeekSignature]);

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
  const confirmedInWeek = hub.assignments.filter(
    (assignment) =>
      assignment.cleanerId === cleaner.cleanerId &&
      assignment.status === "CONFIRMED" &&
      assignment.serviceDate >= week.weekStart &&
      assignment.serviceDate <= week.weekEnd,
  );

  function allWindowsForCheck(draftWindows: AvailabilityWindow[]) {
    const outside = hub.availability
      .filter(
        (window) =>
          window.cleanerId === profile.cleanerId && (window.date < week.weekStart || window.date > week.weekEnd),
      )
      .map((window) => ({ date: window.date, start: window.start, end: window.end }));
    return [...outside, ...draftWindows.map((window) => ({ date: window.date, start: window.start, end: window.end }))];
  }

  function conflictDetailForNewlyUncovered(beforeDraft: AvailabilityWindow[], afterDraft: AvailabilityWindow[]): string | null {
    const beforeWindows = allWindowsForCheck(beforeDraft);
    const afterWindows = allWindowsForCheck(afterDraft);
    for (const assignment of confirmedInWeek) {
      const schedule = toAssignmentSchedule(assignment);
      const wasCovered = !assignmentUncoveredByAvailability(schedule, beforeWindows);
      const nowUncovered = assignmentUncoveredByAvailability(schedule, afterWindows);
      if (!wasCovered || !nowUncovered) continue;
      const job = hub.jobs.find((item) => item.jobId === assignment.jobId);
      const customer = job ? customerFirstNameForCleaner(job.snapshot) : "this customer";
      if (variant === "admin") {
        return `${profile.firstName} is confirmed for ${customer} on ${formatLongDate(assignment.serviceDate)} (${formatArrival(assignment.arrivalWindowStart, assignment.arrivalWindowEnd)}). Saving won’t cover that cleaning — follow up with them.`;
      }
      return `You’re confirmed for ${customer} on ${formatLongDate(assignment.serviceDate)} (${formatArrival(assignment.arrivalWindowStart, assignment.arrivalWindowEnd)}). This change doesn’t cover that cleaning, and you will need to follow up with Kelsey.`;
    }
    return null;
  }

  function applyDraft(next: AvailabilityWindow[]) {
    setDraft(mergeAdjacentWindows(next));
  }

  function setDay(date: string, available: boolean) {
    const rest = draft.filter((window) => window.date !== date);
    if (!available) {
      applyDraft(rest);
      return;
    }
    applyDraft([
      ...rest,
      {
        availabilityId: `draft-${date}-0`,
        cleanerId: profile.cleanerId,
        date,
        start: OPEN_DAY_START,
        end: OPEN_DAY_END,
      },
    ]);
  }

  function updateWindow(id: string, patch: Partial<AvailabilityWindow>) {
    applyDraft(draft.map((window) => (window.availabilityId === id ? { ...window, ...patch } : window)));
  }

  function addWindow(date: string) {
    const dayWindows = draft
      .filter((window) => window.date === date)
      .sort((a, b) => {
        if (!a.start && !b.start) return 0;
        if (!a.start) return 1;
        if (!b.start) return -1;
        return a.start.localeCompare(b.start);
      });
    const last = dayWindows.at(-1);
    let defaultStart = "";
    if (last?.end && isValidLocalTime(last.end) && last.end !== OPEN_DAY_END) {
      defaultStart = last.end;
    } else if (last?.start && isValidLocalTime(last.start)) {
      defaultStart = last.start;
    }
    applyDraft([
      ...draft,
      {
        availabilityId: `draft-${date}-${draft.length}`,
        cleanerId: profile.cleanerId,
        date,
        start: defaultStart,
        end: "",
      },
    ]);
  }

  function copyDayForward(date: string) {
    const later = days.filter((day) => day > date);
    if (later.length === 0) return;
    const source = draft.filter((window) => window.date === date);
    const rest = draft.filter((window) => window.date <= date);
    const copied = later.flatMap((day) =>
      source.map((window, index) => ({
        ...window,
        availabilityId: `copy-${day}-${index}-${draft.length}`,
        date: day,
      })),
    );
    applyDraft([...rest, ...copied]);
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
    if (copied.length === 0) {
      setTone("ok");
      setMessage("Last week had no availability to copy.");
      return;
    }
    const mergedCopy = mergeAdjacentWindows(copied);
    setDraft(mergedCopy);
    setTone("ok");
    setMessage("Last week was copied. Review it, then submit.");
  }

  async function submit(options?: { quiet?: boolean; skipConflictCheck?: boolean }): Promise<boolean> {
    const check = validateAvailabilityWindows(
      draft.map((window) => ({ date: window.date, start: window.start, end: window.end })),
    );
    if (!check.ok) {
      setTone("error");
      setMessage(check.message);
      return false;
    }
    if (!options?.skipConflictCheck) {
      const detail = conflictDetailForNewlyUncovered(editBaselineRef.current, draft);
      if (detail) {
        setConflictPrompt({
          detail,
          onConfirm: () => {
            setConflictPrompt(null);
            void submit({ ...options, skipConflictCheck: true });
          },
        });
        return false;
      }
    }
    setSubmitting(true);
    try {
      const result = await hub.submitAvailability(profile.cleanerId, week.weekStart, draft, {
        quiet: options?.quiet,
      });
      if (!result.ok) {
        setTone("error");
        setMessage(result.message);
        return false;
      }
      const submitted = mergeAdjacentWindows(draft);
      editBaselineRef.current = submitted;
      setTone("ok");
      setMessage(null);
      return true;
    } finally {
      setSubmitting(false);
    }
  }

  function pickWeek(nextStart: string) {
    if (nextStart === week.weekStart || switchingToWeek) return;
    if (dirty) {
      setSwitchingToWeek(nextStart);
      void submit().then((saved) => {
        setSwitchingToWeek(null);
        if (!saved) return;
        onWeekStartChange(nextStart);
      });
      return;
    }
    onWeekStartChange(nextStart);
  }

  useImperativeHandle(ref, () => ({
    isDirty: () => dirty,
    save: () => submit(),
  }));

  function submitAndLeave() {
    const href = leaveHref;
    return submit().then((saved) => {
      if (!saved) {
        setLeaveHref(null);
        return false;
      }
      setLeaveHref(null);
      if (href) window.location.assign(href);
      return true;
    });
  }

  const submitLabel = variant === "admin" ? "Save availability" : "Submit Availability";
  const introCopy =
    variant === "admin"
      ? submitted
        ? "Submitted for this week. You can edit on their behalf."
        : "No submission yet for this week."
      : submitted
        ? "Submitted. You can still edit this week."
        : week.weekStart === dueWeekStart
          ? `Due by Sunday, ${formatMonthDay(availabilityDueSunday)}.`
          : "Set the hours you are available this week.";

  return (
    <div className="space-y-3">
        <div className={embedded ? "" : "sticky top-0 z-20 -mx-5 bg-cream px-5 pb-3 pt-1"}>
          <div className="flex gap-2">
          {editableWeeks.map((option, index) => {
            const optionSubmitted = hub.submissions.some(
              (submission) => submission.cleanerId === cleaner.cleanerId && submission.weekStart === option.weekStart,
            );
            const selected = option.weekStart === week.weekStart;
            const savingCurrentWeek = switchingToWeek !== null && option.weekStart === week.weekStart;
            const loadingTargetWeek = switchingToWeek === option.weekStart;
            const weekToggleBusy = switchingToWeek !== null;
            const weekLabel = index === 0 ? "Current week" : "Next week";
            const statusClass = selected ? "text-cream/80" : "text-ink/55";
            const statusEmphasis = selected ? "text-cream" : "text-ink/70";
            return (
              <button
                key={option.weekStart}
                type="button"
                disabled={weekToggleBusy}
                aria-busy={savingCurrentWeek || loadingTargetWeek}
                onClick={() => pickWeek(option.weekStart)}
                className={`flex min-h-12 flex-1 flex-col items-center justify-center rounded-2xl px-2 py-2 disabled:opacity-70 ${
                  selected ? "bg-ink text-cream" : "bg-white text-ink ring-1 ring-ink/10"
                }`}
              >
                <span
                  className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${
                    selected ? "text-cream/75" : "text-ink/50"
                  }`}
                >
                  {weekLabel}
                </span>
                <span className="mt-0.5 text-sm font-semibold leading-5">{formatWeekRange(option.weekStart, option.weekEnd)}</span>
                {savingCurrentWeek ? (
                  <span className={`mt-0.5 text-xs font-semibold ${statusEmphasis}`}>Saving…</span>
                ) : loadingTargetWeek ? (
                  <span className={`mt-0.5 text-xs font-semibold ${statusEmphasis}`}>Loading…</span>
                ) : optionSubmitted ? (
                  <span className={`mt-0.5 text-xs font-medium ${statusClass}`}>Submitted</span>
                ) : null}
              </button>
            );
          })}
          </div>
        </div>
        <p className="text-sm text-ink/70">{introCopy}</p>
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
          const allDay = windows.some((window) => window.start === OPEN_DAY_START && window.end === OPEN_DAY_END);
          return (
            <Card key={date}>
              <button
                type="button"
                onClick={() => setDay(date, !available)}
                aria-pressed={available}
                className={`-mx-4 -mt-4 flex w-[calc(100%+2rem)] items-center justify-between gap-3 rounded-t-3xl px-4 pt-4 text-left ${available ? "" : "-mb-4 rounded-b-3xl pb-4"}`}
              >
                <span>
                  <span className="block text-lg font-semibold capitalize">{dayOfWeek(date).toLowerCase()}</span>
                  <span className="block text-sm text-ink/60">{formatLongDate(date)}</span>
                </span>
                <span
                  className={`flex min-h-11 items-center rounded-full px-3 text-sm font-semibold ${available ? "bg-mint text-ink" : "bg-cream text-ink/70"}`}
                >
                  {available ? "Available" : "Not available"}
                </span>
              </button>
              {windows.map((window) => (
                <WindowTimes
                  key={window.availabilityId}
                  start={window.start}
                  end={window.end}
                  onStart={(start) => updateWindow(window.availabilityId, { start })}
                  onEnd={(end) => updateWindow(window.availabilityId, { end })}
                  onRemove={() => applyDraft(draft.filter((item) => item.availabilityId !== window.availabilityId))}
                />
              ))}
              {available ? (
                <div className="mt-3 flex items-center justify-between gap-3">
                  {allDay ? null : (
                    <button type="button" onClick={() => addWindow(date)} className="min-h-11 text-sm font-semibold text-ink">
                      + Add Another Time
                    </button>
                  )}
                  {date < week.weekEnd ? (
                    <button type="button" onClick={() => copyDayForward(date)} className="ml-auto min-h-11 text-sm font-semibold text-ink">
                      copy thru end of week
                    </button>
                  ) : null}
                </div>
              ) : null}
            </Card>
          );
        })}
        {message ? <Notice tone={tone}>{message}</Notice> : null}
        <PrimaryButton type="button" loading={submitting} loadingLabel="Saving…" onClick={() => void submit()}>
          {submitLabel}
        </PrimaryButton>
      {!embedded ? (
      <UnsavedChangesDialog
        open={leaveHref !== null}
        onSave={submitAndLeave}
        onDiscard={() => {
          const href = leaveHref;
          setLeaveHref(null);
          if (href) window.location.assign(href);
        }}
        onDismiss={() => setLeaveHref(null)}
      />
      ) : null}
      {conflictPrompt
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-5 pb-28"
              onClick={() => setConflictPrompt(null)}
            >
              <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={conflictTitleId}
                className="w-full max-w-md rounded-3xl bg-white p-5 text-ink shadow-[0_8px_30px_rgba(51,51,51,0.16)]"
                onClick={(event) => event.stopPropagation()}
              >
                <h2 id={conflictTitleId} className="text-lg font-semibold">Confirmed cleaning</h2>
                <p className="mt-2 text-sm leading-5 text-ink/70">{conflictPrompt.detail}</p>
                <div className="mt-4 space-y-2">
                  <button
                    type="button"
                    onClick={() => setConflictPrompt(null)}
                    className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-ink text-base font-semibold text-cream"
                  >
                    {variant === "admin" ? "Go back" : "Keep my availability"}
                  </button>
                  <button
                    type="button"
                    onClick={conflictPrompt.onConfirm}
                    className="min-h-12 w-full text-base font-semibold text-ink/70"
                  >
                    Submit anyway
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

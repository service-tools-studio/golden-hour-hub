"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useHub } from "@/components/hub-provider";
import { PageHeader, Screen } from "@/components/ui";
import { personName } from "@/lib/domain/cleaners";
import {
  calculateBlockedRange,
  subtractConfirmedBookingsFromAvailability,
  toAssignmentSchedule,
} from "@/lib/domain/scheduling";
import {
  addDays,
  dayOfWeek,
  eachDate,
  formatMonthDay,
  formatTimeLabel,
  minutesFromTime,
  sundayOf,
  timeFromMinutes,
  zonedParts,
} from "@/lib/domain/time";
import type { AvailabilityWindow, CleanerProfile, Job, JobAssignment } from "@/lib/domain/types";
import { formatLongDate, serviceLabel } from "@/lib/format";

type View = "day" | "month";

export function ScheduleView({ initialDate, initialView = "month" }: { initialDate?: string; initialView?: View }) {
  const hub = useHub();
  const [view, setView] = useState<View>(initialView);
  const [date, setDate] = useState(initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : hub.today);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchField = useRef<HTMLInputElement>(null);
  const cleaners = hub.cleaners.filter((cleaner) => cleaner.status === "ACTIVE");
  const showingAll = selectedIds.length === 0;
  const visible = showingAll ? cleaners : cleaners.filter((cleaner) => selectedIds.includes(cleaner.cleanerId));

  const matches = useMemo(() => searchCleanings(hub.jobs, hub.assignments, hub.cleaners, query), [hub.assignments, hub.cleaners, hub.jobs, query]);

  useEffect(() => {
    if (searchOpen) searchField.current?.focus();
  }, [searchOpen]);

  function closeSearch() {
    setSearchOpen(false);
    setQuery("");
  }

  function toggleCleaner(cleanerId: string) {
    setSelectedIds((current) => {
      const next = current.includes(cleanerId)
        ? current.filter((id) => id !== cleanerId)
        : [...current, cleanerId];
      if (next.length === 0 || next.length === cleaners.length) return [];
      return next;
    });
  }

  return (
    <Screen>
      <PageHeader
        title="Schedule"
        subtitle="Availability and confirmed jobs"
        action={
          <div className="mt-1 flex shrink-0 items-center gap-2 self-center">
            <button
              type="button"
              aria-label="Search cleanings"
              aria-pressed={searchOpen}
              onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
              className="flex size-11 items-center justify-center rounded-full bg-ink/10 text-ink"
            >
              <SearchIcon />
            </button>
            <Link
              href={`/admin/jobs/new?date=${date}`}
              aria-label="Book a new cleaning"
              className="flex size-11 items-center justify-center rounded-full bg-ink text-cream"
            >
              <PlusIcon />
            </Link>
          </div>
        }
      />
      {searchOpen ? (
        <ScheduleSearch query={query} onQuery={setQuery} onClose={closeSearch} fieldRef={searchField} matches={matches} />
      ) : (
      <div className="space-y-4 px-5 pt-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <FilterChip active={showingAll} onClick={() => setSelectedIds([])} label="All" />
          {cleaners.map((cleaner) => (
            <FilterChip
              key={cleaner.cleanerId}
              active={!showingAll && selectedIds.includes(cleaner.cleanerId)}
              onClick={() => toggleCleaner(cleaner.cleanerId)}
              label={cleaner.firstName}
            />
          ))}
        </div>
        {view === "day" ? (
          <DayView
            date={date}
            cleanerIds={visible.map((cleaner) => cleaner.cleanerId)}
            onDate={setDate}
            onMonth={() => setView("month")}
          />
        ) : null}
        {view === "month" ? (
          <MonthView
            date={date}
            cleanerIds={visible.map((cleaner) => cleaner.cleanerId)}
            onPickDay={(next) => {
              setDate(next);
              setView("day");
            }}
          />
        ) : null}
      </div>
      )}
    </Screen>
  );
}

function ScheduleSearch({
  query,
  onQuery,
  onClose,
  fieldRef,
  matches,
}: {
  query: string;
  onQuery: (query: string) => void;
  onClose: () => void;
  fieldRef: React.RefObject<HTMLInputElement | null>;
  matches: Job[];
}) {
  return (
    <div className="space-y-3 px-5 pt-4">
      <div className="flex items-center gap-2">
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-white px-3 text-ink">
          <SearchIcon />
          <input
            ref={fieldRef}
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Customer, address, or cleaner"
            aria-label="Search cleanings"
            className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-ink/40"
          />
        </label>
        <button type="button" onClick={onClose} className="shrink-0 text-sm font-semibold text-ink">
          Cancel
        </button>
      </div>
      {query.trim() === "" ? (
        <p className="px-1 text-sm text-ink/55">Search cleanings by customer, address, or cleaner.</p>
      ) : matches.length === 0 ? (
        <p className="px-1 text-sm text-ink/55">No cleanings match.</p>
      ) : (
        <ul className="space-y-2">
          {matches.map((job) => (
            <li key={job.jobId}>
              <Link href={`/admin/jobs/${job.jobId}?from=schedule`} className="block rounded-2xl bg-white px-3 py-3">
                <span className="block font-semibold">{job.snapshot.customerDisplayName}</span>
                <span className="mt-0.5 block text-sm text-ink/70">
                  {serviceLabel(job.serviceType)} · {formatLongDate(job.date)}
                </span>
                <span className="mt-0.5 block text-sm text-ink/55">{job.snapshot.streetAddress}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <circle cx="11" cy="11" r="6.25" stroke="currentColor" strokeWidth="2" />
      <path d="M16 16.5L20 20.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}

function searchCleanings(jobs: Job[], assignments: JobAssignment[], cleaners: CleanerProfile[], query: string): Job[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const digits = needle.replace(/\D/g, "");
  return jobs
    .filter((job) => job.status !== "CANCELED" && cleaningMatches(job, assignments, cleaners, needle, digits))
    .sort((a, b) => a.date.localeCompare(b.date) || a.snapshot.customerDisplayName.localeCompare(b.snapshot.customerDisplayName));
}

function cleaningMatches(job: Job, assignments: JobAssignment[], cleaners: CleanerProfile[], needle: string, digits: string): boolean {
  const cleanerNames = [
    ...assignments
      .filter((assignment) => assignment.jobId === job.jobId && assignment.status !== "CANCELED" && assignment.status !== "EXPIRED_JOB_FILLED")
      .map((assignment) => cleaners.find((cleaner) => cleaner.cleanerId === assignment.cleanerId)),
    ...(job.draftCleanerIds ?? []).map((cleanerId) => cleaners.find((cleaner) => cleaner.cleanerId === cleanerId)),
  ]
    .filter((cleaner): cleaner is CleanerProfile => Boolean(cleaner))
    .map((cleaner) => personName(cleaner.firstName, cleaner.lastName));
  const text = [
    job.snapshot.customerDisplayName,
    job.snapshot.streetAddress,
    job.snapshot.city,
    job.snapshot.propertyLabel,
    serviceLabel(job.serviceType),
    formatLongDate(job.date),
    job.date,
    ...cleanerNames,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (text.includes(needle)) return true;
  const phone = job.snapshot.phone.replace(/\D/g, "");
  return digits.length >= 3 && phone.includes(digits);
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold ${
        active ? "bg-gold text-ink" : "bg-white text-ink/70"
      }`}
    >
      {label}
    </button>
  );
}

function DayView({
  date,
  cleanerIds,
  onDate,
  onMonth,
}: {
  date: string;
  cleanerIds: string[];
  onDate: (date: string) => void;
  onMonth: () => void;
}) {
  const hub = useHub();
  const openings = useDatesWithCleanerOpenings(cleanerIds);
  const scroller = useRef<HTMLDivElement>(null);
  const ready = useRef(false);
  const lock = useRef(false);
  const pendingWidth = useRef<number | null>(null);
  const [weeks, setWeeks] = useState(() => weekRange(sundayOf(date), 8, 10));

  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) return;
    if (pendingWidth.current != null) {
      node.scrollLeft += node.scrollWidth - pendingWidth.current;
      pendingWidth.current = null;
      lock.current = false;
      return;
    }
    if (!ready.current) {
      const index = weeks.findIndex((start) => start === sundayOf(date));
      if (index >= 0) node.scrollLeft = index * node.clientWidth;
      ready.current = true;
    }
  });

  function settleWeek() {
    const node = scroller.current;
    if (!node || !ready.current || lock.current || node.clientWidth === 0) return;
    const index = Math.round(node.scrollLeft / node.clientWidth);
    const start = weeks[index];
    if (!start) return;
    const offset = eachDate(sundayOf(date), date).length - 1;
    const next = addDays(start, offset);
    if (next !== date) onDate(next);
    if (index <= 1) {
      lock.current = true;
      pendingWidth.current = node.scrollWidth;
      setWeeks((current) => [...weekRange(current[0], 3, 0).slice(0, 3), ...current]);
      return;
    }
    if (index >= weeks.length - 2) {
      lock.current = true;
      const last = weeks[weeks.length - 1];
      setWeeks((current) => [...current, ...weekRange(addDays(last, 7), 0, 2)]);
    }
  }

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    node.addEventListener("scrollend", settleWeek);
    return () => node.removeEventListener("scrollend", settleWeek);
  });

  return (
    <div>
      <div className="rounded-3xl bg-white px-3 pb-4 pt-3">
        <button
          type="button"
          onClick={onMonth}
          className="inline-flex min-h-10 items-center gap-1 rounded-full bg-cream px-3 text-base font-semibold"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {monthTitle(date)}
        </button>
        <div
          ref={scroller}
          aria-label="Weeks"
          className="mt-3 flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {weeks.map((start) => (
            <div key={start} className="grid min-w-full shrink-0 snap-start grid-cols-7">
              {eachDate(start, addDays(start, 6)).map((day, index) => {
                const today = day === hub.today;
                const selected = day === date;
                return (
                  <button key={day} type="button" onClick={() => onDate(day)} className="flex flex-col items-center gap-1 py-1" aria-current={today ? "date" : undefined}>
                    <span className="text-[11px] font-semibold text-ink/40">{WEEKDAY_LETTERS[index]}</span>
                    <span
                      className={`flex size-9 items-center justify-center rounded-full text-base ${
                        today ? "bg-mint font-semibold text-ink" : selected ? "bg-ink/10 font-semibold text-ink" : "text-ink"
                      }`}
                    >
                      {Number(day.slice(8))}
                    </span>
                    {openings.has(day) ? <span className="size-1.5 rounded-full bg-mint" aria-hidden="true" /> : <span className="size-1.5" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="sticky top-0 z-10 -mx-5 bg-cream px-5 pb-3 pt-4 text-center text-base font-semibold">{dayHeading(date)}</p>
      <DayTimeline date={date} cleanerIds={cleanerIds} />
    </div>
  );
}

const HOUR_PX = 40;
const GRID_PAD_TOP = 10;
const GRID_PAD_BOTTOM = 14;

type EventTone = "open" | "confirmed" | "pending";

type DayEvent = {
  id: string;
  cleanerId: string;
  order: number;
  startMin: number;
  endMin: number;
  href: string;
  title: string;
  subtitle: string;
  location?: string;
  time: string;
  tone: EventTone;
  assignmentId?: string;
  windowMinutes?: number;
};

const TONE_CLASS: Record<EventTone, string> = {
  open: "bg-mint",
  confirmed: "bg-gold",
  pending: "bg-white",
};

const ACCENT_CLASS: Record<EventTone, string> = {
  open: "bg-[#12858b]",
  confirmed: "bg-[#8d6b16]",
  pending: "bg-[#8d6b16]",
};

function DayTimeline({ date, cleanerIds }: { date: string; cleanerIds: string[] }) {
  const hub = useHub();
  const ids = cleanerIds.join("\0");
  const built = useMemo(
    () =>
      buildDayEvents({
        date,
        cleanerIds: ids ? ids.split("\0") : [],
        cleaners: hub.cleaners,
        jobs: hub.jobs,
        assignments: hub.assignments,
        availability: hub.availability,
      }),
    [date, hub.assignments, hub.availability, hub.cleaners, hub.jobs, ids],
  );
  const laidOut = layoutDayEvents(built.events);
  const grid = gridBounds(built.events);
  const hours = Array.from({ length: (grid.end - grid.start) / 60 + 1 }, (_, index) => grid.start / 60 + index);
  const height = GRID_PAD_TOP + ((grid.end - grid.start) / 60) * HOUR_PX + GRID_PAD_BOTTOM;
  const now = date === hub.today ? nowMinutes() : null;
  const showNow = now != null && now >= grid.start && now <= grid.end;

  return (
    <div className="rounded-3xl bg-white px-2 pb-3 pt-2">
      <div className="relative" style={{ height }}>
        {hours.map((hour) => (
          <div
            key={hour}
            className="absolute right-0 left-12 border-t border-ink/10"
            style={{ top: GRID_PAD_TOP + ((hour * 60 - grid.start) / 60) * HOUR_PX }}
          >
            <span className="absolute -left-12 top-0 w-11 -translate-y-1/2 pr-1 text-right text-[11px] font-medium text-ink/40">
              {hourLabel(hour)}
            </span>
          </div>
        ))}
        {showNow && now != null ? (
          <div
            className="absolute right-0 left-12 z-20 h-0.5 bg-[#e15b64]"
            style={{ top: GRID_PAD_TOP + ((now - grid.start) / 60) * HOUR_PX }}
          >
            <span className="absolute -left-1 top-1/2 size-2 -translate-y-1/2 rounded-full bg-[#e15b64]" />
          </div>
        ) : null}
        <div className="absolute right-1 left-12" style={{ top: 0, height }}>
          {laidOut.map((event) =>
            event.assignmentId && event.windowMinutes ? (
              <DraggableBooking key={event.id} event={event} gridStart={grid.start} />
            ) : (
              <Link
                key={event.id}
                href={event.href}
                aria-label={`${event.title}. ${event.subtitle}. ${event.location ? `${event.location}. ` : ""}${event.time}`}
                className={`absolute z-10 overflow-hidden rounded-md text-ink ${TONE_CLASS[event.tone]}`}
                style={eventBoxStyle(event, grid.start)}
              >
                <EventBody event={event} />
              </Link>
            ),
          )}
        </div>
      </div>
      {built.quiet.length > 0 ? (
        <p className="px-2 pt-1 text-sm text-ink/50">
          {nameList(built.quiet)} {built.quiet.length === 1 ? "has" : "have"} no availability this day.
        </p>
      ) : null}
    </div>
  );
}

const SNAP_MINUTES = 15;

function eventBoxStyle(
  event: { startMin: number; endMin: number; column: number; columns: number },
  gridStart: number,
) {
  return {
    top: GRID_PAD_TOP + ((event.startMin - gridStart) / 60) * HOUR_PX,
    height: Math.max(((event.endMin - event.startMin) / 60) * HOUR_PX - 3, 28),
    left: `calc(${(event.column / event.columns) * 100}% + 2px)`,
    width: `calc(${100 / event.columns}% - 4px)`,
  };
}

function snappedStart(originStart: number, span: number, deltaY: number) {
  const raw = originStart + (deltaY / HOUR_PX) * 60;
  const snapped = Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES;
  return Math.max(0, Math.min(24 * 60 - span, snapped));
}

function DraggableBooking({
  event,
  gridStart,
}: {
  event: DayEvent & { column: number; columns: number };
  gridStart: number;
}) {
  const hub = useHub();
  const drag = useRef<{ pointerId: number; originY: number; originStart: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [previewStart, setPreviewStart] = useState<number | null>(null);
  const span = event.endMin - event.startMin;
  const startMin = previewStart ?? event.startMin;
  const shown = { ...event, startMin, endMin: startMin + span, time: rangeLabel(startMin, startMin + span) };

  if (previewStart != null && !drag.current && event.startMin === previewStart) setPreviewStart(null);

  function onPointerDown(pointer: React.PointerEvent<HTMLAnchorElement>) {
    if (pointer.button !== 0) return;
    drag.current = { pointerId: pointer.pointerId, originY: pointer.clientY, originStart: event.startMin, moved: false };
    try {
      pointer.currentTarget.setPointerCapture(pointer.pointerId);
    } catch {
      // Synthetic events used in tests cannot capture the pointer.
    }
  }

  function onPointerMove(pointer: React.PointerEvent<HTMLAnchorElement>) {
    const state = drag.current;
    if (!state || state.pointerId !== pointer.pointerId) return;
    const delta = pointer.clientY - state.originY;
    if (!state.moved && Math.abs(delta) < 6) return;
    state.moved = true;
    setPreviewStart(snappedStart(state.originStart, span, delta));
  }

  function finish(pointer: React.PointerEvent<HTMLAnchorElement>, commit: boolean) {
    const state = drag.current;
    if (!state || state.pointerId !== pointer.pointerId) return;
    drag.current = null;
    if (!commit || !state.moved || !event.assignmentId || !event.windowMinutes) {
      setPreviewStart(null);
      return;
    }
    suppressClick.current = true;
    const next = snappedStart(state.originStart, span, pointer.clientY - state.originY);
    if (next === event.startMin) {
      setPreviewStart(null);
      return;
    }
    const result = hub.moveAssignmentTime(event.assignmentId, timeFromMinutes(next), timeFromMinutes(next + event.windowMinutes));
    if (!result.ok) {
      setPreviewStart(null);
      hub.flash(result.message);
      return;
    }
    setPreviewStart(next);
  }

  return (
    <a
      href={event.href}
      draggable={false}
      aria-label={`${shown.title}. ${shown.subtitle}. ${shown.location ? `${shown.location}. ` : ""}${shown.time}`}
      onDragStart={(native) => native.preventDefault()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(pointer) => finish(pointer, true)}
      onPointerCancel={(pointer) => finish(pointer, false)}
      onClick={(click) => {
        if (!suppressClick.current) return;
        click.preventDefault();
        suppressClick.current = false;
      }}
      className={`absolute cursor-grab touch-none overflow-hidden rounded-md text-ink select-none active:cursor-grabbing ${TONE_CLASS[event.tone]} ${previewStart != null ? "z-30 shadow-[0_8px_24px_rgba(51,51,51,0.16)]" : event.tone === "pending" ? "z-[15]" : "z-10"}`}
      style={eventBoxStyle(shown, gridStart)}
    >
      <EventBody event={shown} />
    </a>
  );
}

function EventBody({ event }: { event: DayEvent }) {
  return (
    <>
      <span className={`absolute inset-y-0 left-0 w-1 ${ACCENT_CLASS[event.tone]}`} />
      <span className="block py-1 pr-1.5 pl-2.5">
        <span className="block truncate text-[13px] leading-4 font-semibold">{event.title}</span>
        <span className="mt-0.5 block truncate text-[11px] leading-4 text-ink/75">{event.subtitle}</span>
        {event.location ? (
          <span className="mt-0.5 flex items-start gap-1 text-[11px] leading-4 text-ink/75">
            <PinIcon />
            <span className="truncate">{event.location}</span>
          </span>
        ) : null}
        <span className="mt-0.5 flex items-start gap-1 text-[11px] leading-4 text-ink/75">
          <ClockIcon />
          <span className="truncate">{event.time}</span>
        </span>
      </span>
    </>
  );
}

function PinIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-px shrink-0">
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="10" r="2.2" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-px shrink-0">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8.5V12l2.5 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function buildDayEvents(input: {
  date: string;
  cleanerIds: string[];
  cleaners: CleanerProfile[];
  jobs: Job[];
  assignments: JobAssignment[];
  availability: AvailabilityWindow[];
}): { events: DayEvent[]; quiet: string[] } {
  const events: DayEvent[] = [];
  const quiet: string[] = [];
  const several = input.cleanerIds.length > 1;
  input.cleanerIds.forEach((cleanerId, cleanerIndex) => {
    const cleaner = input.cleaners.find((item) => item.cleanerId === cleanerId);
    if (!cleaner) return;
    const before = events.length;
    const own = input.assignments.filter((assignment) => assignment.cleanerId === cleanerId);
    const windows = input.availability
      .filter((window) => window.cleanerId === cleanerId)
      .map((window) => ({ date: window.date, start: window.start, end: window.end }));
    const confirmed = own.filter((assignment) => assignment.status === "CONFIRMED");
    const open = subtractConfirmedBookingsFromAvailability(windows, confirmed.map(toAssignmentSchedule)).filter(
      (window) => window.date === input.date,
    );
    for (const window of open) {
      const startMin = minutesFromTime(window.start);
      const endMin = minutesFromTime(window.end);
      if (endMin <= startMin) continue;
      const params = new URLSearchParams({ cleanerId, date: input.date, start: window.start, end: window.end });
      events.push({
        id: `${cleanerId}-open-${window.start}-${window.end}`,
        cleanerId,
        order: cleanerIndex * 10,
        startMin,
        endMin,
        href: `/admin/jobs/new?${params}`,
        title: personName(cleaner.firstName, cleaner.lastName),
        subtitle: "Available",
        time: rangeLabel(startMin, endMin),
        tone: "open",
      });
    }
    for (const assignment of own.filter((item) => item.serviceDate === input.date)) {
      if (
        assignment.status !== "CONFIRMED" &&
        assignment.status !== "INVITED" &&
        assignment.status !== "PENDING_AVAILABILITY" &&
        assignment.status !== "NEEDS_ATTENTION"
      ) {
        continue;
      }
      const job = input.jobs.find((item) => item.jobId === assignment.jobId);
      const span = calculateBlockedRange({
        date: assignment.serviceDate,
        arrivalWindowStart: assignment.arrivalWindowStart,
        arrivalWindowEnd: assignment.arrivalWindowEnd,
        expectedDurationMinutes: assignment.expectedDurationMinutes,
      }).spans.find((item) => item.date === input.date);
      if (!job || !span || span.endMin <= span.startMin) continue;
      const pending = assignment.status !== "CONFIRMED";
      const who = several ? `${cleaner.firstName} · ` : "";
      const windowMinutes = minutesFromTime(assignment.arrivalWindowEnd) - minutesFromTime(assignment.arrivalWindowStart);
      events.push({
        id: assignment.assignmentId,
        cleanerId,
        order: cleanerIndex * 10 + (pending ? 2 : 1),
        startMin: span.startMin,
        endMin: span.endMin,
        href: `/admin/jobs/${job.jobId}?from=schedule`,
        title: job.snapshot.customerDisplayName,
        subtitle: pending
          ? `${who}${pendingLabel(assignment, cleaner.firstName)}`
          : `${who}${serviceLabel(job.serviceType)}`,
        location: job.snapshot.streetAddress,
        time: rangeLabel(span.startMin, span.endMin),
        tone: pending ? "pending" : "confirmed",
        assignmentId: windowMinutes > 0 ? assignment.assignmentId : undefined,
        windowMinutes: windowMinutes > 0 ? windowMinutes : undefined,
      });
    }
    if (events.length === before) quiet.push(personName(cleaner.firstName, cleaner.lastName));
  });
  return { events, quiet };
}

function pendingLabel(assignment: JobAssignment, firstName: string): string {
  if (assignment.attentionReason) return assignment.attentionReason;
  if (assignment.status === "PENDING_AVAILABILITY") return `Waiting on ${firstName}`;
  if (assignment.status === "NEEDS_ATTENTION") return "Needs attention";
  return "Invitation pending";
}

function shortClock(minutes: number): { clock: string; suffix: string } {
  const [clock, suffix] = formatTimeLabel(timeFromMinutes(minutes)).split(" ");
  const [hour, minute] = clock.split(":");
  return { clock: minute === "00" ? hour : clock, suffix };
}

function rangeLabel(startMin: number, endMin: number): string {
  const start = shortClock(startMin);
  const end = shortClock(endMin);
  if (start.suffix === end.suffix) return `${start.clock}–${end.clock} ${end.suffix}`;
  return `${start.clock} ${start.suffix}–${end.clock} ${end.suffix}`;
}

function hourLabel(hour: number): string {
  const suffix = hour >= 12 ? "PM" : "AM";
  const clock = hour % 12 === 0 ? 12 : hour % 12;
  return `${clock} ${suffix}`;
}

function nowMinutes(): number {
  const parts = zonedParts(new Date());
  return parts.hour * 60 + parts.minute;
}

function gridBounds(events: DayEvent[]): { start: number; end: number } {
  let start = 8 * 60;
  let end = 18 * 60;
  for (const event of events) {
    start = Math.min(start, Math.floor(event.startMin / 60) * 60);
    end = Math.max(end, Math.ceil(event.endMin / 60) * 60);
  }
  start = Math.max(0, start);
  end = Math.min(24 * 60, Math.max(end, start + 60));
  return { start, end };
}

function layoutDayEvents(events: DayEvent[]): Array<DayEvent & { column: number; columns: number }> {
  const pending = events.filter((event) => event.tone === "pending");
  const base = events.filter((event) => event.tone !== "pending");
  const laid = layoutColumns(base);
  const hosted: Array<DayEvent & { column: number; columns: number }> = [];
  const unhosted: DayEvent[] = [];
  for (const invite of pending) {
    const host = openHost(laid, invite);
    if (host) hosted.push({ ...invite, column: host.column, columns: host.columns });
    else unhosted.push(invite);
  }
  if (unhosted.length === 0) return [...laid, ...hosted];
  const withOrphans = layoutColumns([...base, ...unhosted]);
  return [
    ...withOrphans,
    ...pending
      .filter((invite) => !unhosted.includes(invite))
      .flatMap((invite) => {
        const host = openHost(withOrphans, invite);
        return host ? [{ ...invite, column: host.column, columns: host.columns }] : [];
      }),
  ];
}

function openHost(
  laid: Array<DayEvent & { column: number; columns: number }>,
  invite: DayEvent,
): (DayEvent & { column: number; columns: number }) | null {
  const opens = laid.filter((event) => event.tone === "open" && event.cleanerId === invite.cleanerId);
  if (opens.length === 0) return null;
  return opens.reduce((best, event) => (overlapMinutes(event, invite) > overlapMinutes(best, invite) ? event : best));
}

function overlapMinutes(a: { startMin: number; endMin: number }, b: { startMin: number; endMin: number }): number {
  return Math.max(0, Math.min(a.endMin, b.endMin) - Math.max(a.startMin, b.startMin));
}

function layoutColumns(events: DayEvent[]): Array<DayEvent & { column: number; columns: number }> {
  const sorted = [...events].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin || a.order - b.order);
  const laid: Array<DayEvent & { column: number; columns: number }> = [];
  let group: DayEvent[] = [];
  let groupEnd = -1;

  function placeGroup() {
    const columnEnds: number[] = [];
    const placed: { event: DayEvent; column: number }[] = [];
    for (const event of group) {
      let column = columnEnds.findIndex((end) => end <= event.startMin);
      if (column < 0) {
        column = columnEnds.length;
        columnEnds.push(event.endMin);
      } else {
        columnEnds[column] = event.endMin;
      }
      placed.push({ event, column });
    }
    for (const item of placed) laid.push({ ...item.event, column: item.column, columns: columnEnds.length });
    group = [];
    groupEnd = -1;
  }

  for (const event of sorted) {
    if (group.length > 0 && event.startMin >= groupEnd) placeGroup();
    group.push(event);
    groupEnd = Math.max(groupEnd, event.endMin);
  }
  if (group.length > 0) placeGroup();
  return laid;
}

function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

function weekRange(sunday: string, before: number, after: number): string[] {
  const first = addDays(sunday, -7 * before);
  return Array.from({ length: before + after + 1 }, (_, index) => addDays(first, index * 7));
}

function monthTitle(date: string): string {
  const { year, month, day } = { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)), day: Number(date.slice(8, 10)) };
  return new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function dayHeading(date: string): string {
  const weekday = dayOfWeek(date);
  const label = weekday.charAt(0) + weekday.slice(1).toLowerCase();
  return `${label} – ${formatMonthDay(date)}, ${date.slice(0, 4)}`;
}

function shiftMonth(monthStart: string, delta: number): string {
  const shifted = new Date(Date.UTC(Number(monthStart.slice(0, 4)), Number(monthStart.slice(5, 7)) - 1 + delta, 1, 12));
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${month}-01`;
}

function monthRows(monthStart: string): (string | null)[][] {
  const sunday = sundayOf(monthStart);
  const leading = sunday === monthStart ? 0 : eachDate(sunday, addDays(monthStart, -1)).length;
  const days: string[] = [];
  let cursor = monthStart;
  while (cursor.slice(0, 7) === monthStart.slice(0, 7)) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  const cells: (string | null)[] = [...Array(leading).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (string | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) rows.push(cells.slice(index, index + 7));
  return rows;
}

function useDatesWithCleanerOpenings(cleanerIds: string[]) {
  const hub = useHub();
  const ids = cleanerIds.join("\0");
  return useMemo(() => {
    const dates = new Set<string>();
    for (const cleanerId of ids ? ids.split("\0") : []) {
      const windows = hub.availability
        .filter((window) => window.cleanerId === cleanerId)
        .map((window) => ({ date: window.date, start: window.start, end: window.end }));
      const confirmed = hub.assignments.filter(
        (assignment) => assignment.cleanerId === cleanerId && assignment.status === "CONFIRMED",
      );
      for (const window of subtractConfirmedBookingsFromAvailability(windows, confirmed.map(toAssignmentSchedule))) {
        dates.add(window.date);
      }
    }
    return dates;
  }, [hub.assignments, hub.availability, ids]);
}

function MonthView({
  date,
  cleanerIds,
  onPickDay,
}: {
  date: string;
  cleanerIds: string[];
  onPickDay: (date: string) => void;
}) {
  const hub = useHub();
  const openings = useDatesWithCleanerOpenings(cleanerIds);
  const scroller = useRef<HTMLDivElement>(null);
  const focus = `${date.slice(0, 7)}-01`;
  const months = [-1, 0, 1, 2, 3].map((delta) => shiftMonth(focus, delta));

  useLayoutEffect(() => {
    const node = scroller.current;
    const target = node?.querySelector<HTMLElement>(`[data-month="${date.slice(0, 7)}"]`);
    if (!node || !target) return;
    node.scrollTop += target.getBoundingClientRect().top - node.getBoundingClientRect().top;
  }, [date]);

  return (
    <div className="rounded-3xl bg-white px-2 pb-4">
      <div className="grid grid-cols-7 px-1 pb-1 pt-3">
        {WEEKDAY_LETTERS.map((label, index) => (
          <p key={`${label}-${index}`} className="text-center text-xs font-semibold text-ink/40">
            {label}
          </p>
        ))}
      </div>
      <div ref={scroller} className="max-h-[calc(100dvh-18rem)] overflow-y-auto">
      {months.map((month) => (
        <section key={month} data-month={month.slice(0, 7)} className="px-1 pt-3">
          <h2 className="px-1 text-4xl font-semibold tracking-tight">{monthTitle(month)}</h2>
          <div className="mt-2">
            {monthRows(month).map((row, rowIndex) => (
              <div key={`${month}-${rowIndex}`} className="grid grid-cols-7">
                {row.map((day, dayIndex) =>
                  day ? (
                    <button
                      key={day}
                      type="button"
                      onClick={() => onPickDay(day)}
                      aria-current={day === hub.today ? "date" : undefined}
                      className="flex min-h-12 flex-col items-center justify-center text-sm text-ink"
                    >
                      <span
                        className={`flex size-8 items-center justify-center rounded-full ${
                          day === hub.today ? "bg-mint font-semibold" : ""
                        }`}
                      >
                        {Number(day.slice(8))}
                      </span>
                      {openings.has(day) ? <span className="mt-0.5 size-1.5 rounded-full bg-mint" aria-hidden="true" /> : <span className="mt-0.5 size-1.5" />}
                    </button>
                  ) : (
                    <span key={`${month}-empty-${rowIndex}-${dayIndex}`} />
                  ),
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
      </div>
    </div>
  );
}


"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AdminMarketTabs, useAdminMarket } from "@/components/admin/admin-market";
import { useHub } from "@/components/hub-provider";
import { PageHeader, PlusIcon, Screen } from "@/components/ui";
import { personName } from "@/lib/domain/cleaners";
import { isUnsetArrival } from "@/lib/domain/arrival";
import { hasKnownDurationMinutes } from "@/lib/domain/duration";
import { calculateBlockedRange } from "@/lib/domain/scheduling";
import { minutesFromTime } from "@/lib/domain/time";
import {
  addDays,
  eachDate,
  firstOfMonth,
  formatTimeLabel,
  daysInMonth,
  shiftMonth,
  sundayOf,
  timeFromMinutes,
} from "@/lib/domain/time";
import { jobMatchesAdminMarket } from "@/lib/domain/markets";
import type { CleanerProfile, Job, JobAssignment, RecurringSeries } from "@/lib/domain/types";
import { formatLongDate, serviceLabel } from "@/lib/format";

type View = "day" | "month";

export function ScheduleView({ initialDate, initialView = "month" }: { initialDate?: string; initialView?: View }) {
  const hub = useHub();
  const { marketFilter, viewingToday } = useAdminMarket();
  useEffect(() => {
    if (!hub.ready) return;
    hub.refreshRecurringHorizon();
  }, [hub.ready, hub.refreshRecurringHorizon]);
  const [view, setView] = useState<View>(initialView);
  const [date, setDate] = useState(initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : viewingToday);
  const marketJobs = useMemo(
    () => hub.jobs.filter((job) => jobMatchesAdminMarket(job, marketFilter)),
    [hub.jobs, marketFilter],
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dayViewKey, setDayViewKey] = useState(0);
  const searchField = useRef<HTMLInputElement>(null);
  const cleaners = hub.cleaners.filter((cleaner) => cleaner.status === "ACTIVE");
  const cleanerIds = cleaners.map((cleaner) => cleaner.cleanerId);

  const matches = useMemo(
    () => searchCleanings(marketJobs, hub.assignments, hub.cleaners, query),
    [hub.assignments, hub.cleaners, marketJobs, query],
  );

  useEffect(() => {
    if (searchOpen) searchField.current?.focus();
  }, [searchOpen]);

  function closeSearch() {
    setSearchOpen(false);
    setQuery("");
  }

  return (
    <Screen>
      <PageHeader
        title="Schedule"
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
      <div className="px-5 pt-4">
        <AdminMarketTabs />
      </div>
      {searchOpen ? (
        <ScheduleSearch query={query} onQuery={setQuery} onClose={closeSearch} fieldRef={searchField} matches={matches} />
      ) : (
        <div className="space-y-4 px-5 pt-4">
          {view === "day" ? (
            <DayView
              key={dayViewKey}
              date={date}
              today={viewingToday}
              cleanerIds={cleanerIds}
              jobs={marketJobs}
              onDate={setDate}
              onMonthView={() => setView("month")}
            />
          ) : null}
          {view === "month" ? (
            <MonthView
              date={date}
              today={viewingToday}
              jobs={marketJobs}
              onPickDay={(next) => {
                setDate(next);
                setView("day");
              }}
            />
          ) : null}
        </div>
      )}
      {searchOpen ? null : (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)] z-20 mx-auto w-full max-w-md px-5">
          <button
            type="button"
            onClick={() => {
              setDate(viewingToday);
              setView("day");
              setDayViewKey((key) => key + 1);
            }}
            className="pointer-events-auto min-h-11 rounded-full bg-ink px-5 text-base font-semibold text-cream shadow-[0_8px_24px_rgba(51,51,51,0.18)]"
          >
            Today
          </button>
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
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                onQuery("");
                fieldRef.current?.focus();
              }}
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink/55 hover:bg-cream hover:text-ink"
            >
              <ClearSearchIcon />
            </button>
          ) : null}
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
                <span className="mt-0.5 block text-sm text-ink/55">
                  {job.snapshot.streetAddress}
                </span>
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

function ClearSearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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

type SegmentTone = "confirmed" | "pending" | "unassigned";

type ScheduleDayItem = {
  jobId: string;
  href: string;
  title: string;
  /** Unstaffed row message (e.g. no cleaner assigned). */
  subtitle?: string;
  serviceTypeLabel?: string;
  staffNames?: string;
  /** Extra status after service line (e.g. invitation pending). */
  statusNote?: string;
  location?: string;
  startMin: number;
  endMin: number;
  segments: SegmentTone[];
  timed: boolean;
};

const TONE_CLASS: Record<SegmentTone, string> = {
  confirmed: "bg-gold",
  pending: "bg-white",
  unassigned: "bg-red-50",
};

const ACCENT_CLASS: Record<SegmentTone, string> = {
  confirmed: "bg-[#8d6b16]",
  pending: "bg-white ring-1 ring-inset ring-ink/15",
  unassigned: "bg-[#e15b64]",
};

const STAFFED_STATUSES = new Set<JobAssignment["status"]>([
  "CONFIRMED",
  "INVITED",
  "NEEDS_ATTENTION",
]);

function DayView({
  date,
  today,
  cleanerIds,
  jobs,
  onDate,
  onMonthView,
}: {
  date: string;
  today: string;
  cleanerIds: string[];
  jobs: Job[];
  onDate: (date: string) => void;
  onMonthView: () => void;
}) {
  const hub = useHub();
  const scheduled = useDatesWithScheduledJobs(jobs);
  const monthStart = firstOfMonth(date);
  useEffect(() => {
    if (!hub.ready) return;
    void hub.ensureScheduleJobsForMonth(monthStart);
    void hub.ensureScheduleJobsForMonth(shiftMonth(monthStart, -1));
    void hub.ensureScheduleJobsForMonth(shiftMonth(monthStart, 1));
  }, [hub.ready, hub.ensureScheduleJobsForMonth, monthStart]);

  function shiftSelectedMonth(delta: number) {
    const dayNum = Number(date.slice(8, 10));
    const nextMonthStart = shiftMonth(monthStart, delta);
    const year = Number(nextMonthStart.slice(0, 4));
    const month = Number(nextMonthStart.slice(5, 7));
    const clampedDay = Math.min(dayNum, daysInMonth(year, month));
    onDate(`${nextMonthStart.slice(0, 7)}-${String(clampedDay).padStart(2, "0")}`);
  }

  const prevMonthStart = shiftMonth(monthStart, -1);
  const nextMonthStart = shiftMonth(monthStart, 1);

  return (
    <div>
      <DaySwipeArea onSwipe={(step) => shiftSelectedMonth(step)}>
        <div className="rounded-3xl bg-white px-2 pb-4 pt-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex min-w-0 items-center gap-0.5">
              <button
                type="button"
                aria-label={`Previous month, ${shortMonthTitle(prevMonthStart)}`}
                onClick={() => shiftSelectedMonth(-1)}
                className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink hover:bg-cream"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <span className="text-xs font-semibold text-ink/55">{shortMonthTitle(prevMonthStart)}</span>
            </div>
            <button
              type="button"
              onClick={onMonthView}
              aria-label="Show all months"
              className="shrink-0 rounded-full px-2 py-1 text-sm font-semibold text-ink/55 hover:bg-cream hover:text-ink"
            >
              {date.slice(0, 4)}
            </button>
            <div className="flex min-w-0 items-center gap-0.5">
              <span className="text-xs font-semibold text-ink/55">{shortMonthTitle(nextMonthStart)}</span>
              <button
                type="button"
                aria-label={`Next month, ${shortMonthTitle(nextMonthStart)}`}
                onClick={() => shiftSelectedMonth(1)}
                className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink hover:bg-cream"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
          <h2 className="mt-1 px-1 text-4xl font-semibold tracking-tight">{monthTitle(date)}</h2>
          <div className="mt-3 grid grid-cols-7 px-1">
            {WEEKDAY_LETTERS.map((label, index) => (
              <p key={`${label}-${index}`} className="pb-1 text-center text-[11px] font-semibold text-ink/40">
                {label}
              </p>
            ))}
          </div>
          {monthRows(monthStart).map((row, rowIndex) => (
            <div key={`${monthStart}-${rowIndex}`} className="grid grid-cols-7 px-1">
              {row.map((day, dayIndex) =>
                day ? (
                  <button
                    key={day}
                    type="button"
                    onClick={() => onDate(day)}
                    aria-current={day === today ? "date" : undefined}
                    className="flex min-h-11 flex-col items-center justify-center py-0.5"
                  >
                    <span
                      className={`flex size-9 items-center justify-center rounded-full text-base ${
                        day === date
                          ? "bg-ink font-semibold text-cream"
                          : day === today
                            ? "bg-mint font-semibold text-ink"
                            : "text-ink"
                      }`}
                    >
                      {Number(day.slice(8))}
                    </span>
                    <span className="mt-0.5 flex h-1.5 items-center justify-center" aria-hidden="true">
                      {scheduled.has(day) ? <span className="size-1.5 rounded-full bg-gold" /> : <span className="size-1.5" />}
                    </span>
                  </button>
                ) : (
                  <span key={`${monthStart}-empty-${rowIndex}-${dayIndex}`} className="min-h-11" />
                ),
              )}
            </div>
          ))}
        </div>
      </DaySwipeArea>
      <DaySwipeArea onSwipe={(step) => onDate(addDays(date, step))}>
        <ScheduleDayAgenda date={date} cleanerIds={cleanerIds} jobs={jobs} />
      </DaySwipeArea>
    </div>
  );
}

function ScheduleDayAgenda({
  date,
  cleanerIds,
  jobs,
}: {
  date: string;
  cleanerIds: string[];
  jobs: Job[];
}) {
  const hub = useHub();
  const ids = cleanerIds.join("\0");
  const list = useMemo(
    () =>
      buildScheduleDayList({
        date,
        cleanerIds: ids ? ids.split("\0") : [],
        cleaners: hub.cleaners,
        jobs,
        assignments: hub.assignments,
        series: hub.series,
      }),
    [date, hub.assignments, hub.cleaners, hub.series, ids, jobs],
  );

  if (list.timed.length === 0 && list.untimed.length === 0) {
    return <p className="py-10 text-center text-sm text-ink/55">No cleanings scheduled for this day.</p>;
  }

  return (
    <ul className="mt-4 space-y-2 pb-4">
      {list.timed.map((item) => (
        <li key={item.jobId}>
          <ScheduleDayRow item={item} />
        </li>
      ))}
      {list.untimed.map((item) => (
        <li key={`${item.jobId}-untimed`}>
          <ScheduleDayRow item={item} />
        </li>
      ))}
    </ul>
  );
}

function ScheduleDayRow({ item }: { item: ScheduleDayItem }) {
  const startClock = item.timed ? formatTimeLabel(timeFromMinutes(item.startMin)) : null;
  const endClock = item.timed ? formatTimeLabel(timeFromMinutes(item.endMin)) : null;
  const split = item.segments.length > 1;

  return (
    <Link
      href={item.href}
      className={`relative flex min-h-[4.5rem] overflow-hidden rounded-2xl ring-1 ring-ink/10 ${
        !split && item.segments[0] === "unassigned" ? "ring-[#e15b64]/30" : ""
      }`}
    >
      {split ? (
        <div className="absolute inset-0 flex" aria-hidden="true">
          {item.segments.map((tone, index) => (
            <div key={index} className={`flex-1 ${TONE_CLASS[tone]} ${index > 0 ? "border-l border-ink/10" : ""}`} />
          ))}
        </div>
      ) : item.segments[0] === "unassigned" ? (
        <div className="absolute inset-0 bg-red-50" aria-hidden="true" />
      ) : item.segments[0] === "confirmed" ? (
        <div className="absolute inset-0 bg-gold/35" aria-hidden="true" />
      ) : (
        <div className="absolute inset-0 bg-white" aria-hidden="true" />
      )}
      <div
        className={`relative z-10 flex w-full min-w-0 items-stretch gap-2 px-3 py-3 ${
          split ? "" : "pl-4"
        }`}
      >
        <div className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-ink">{item.title}</span>
          {item.serviceTypeLabel ? (
            <span className="mt-0.5 block truncate text-sm text-ink/70">
              <span>{item.serviceTypeLabel}</span>
              {item.staffNames ? (
                <>
                  <span className="text-ink/55"> : </span>
                  <span className="text-xs font-normal text-ink/55">{item.staffNames}</span>
                </>
              ) : null}
              {item.statusNote ? (
                <span className="text-xs font-normal text-ink/55"> · {item.statusNote}</span>
              ) : null}
            </span>
          ) : item.subtitle ? (
            <span className="mt-0.5 block truncate text-sm text-ink/70">{item.subtitle}</span>
          ) : null}
          {item.location ? (
            <span className="mt-1 flex items-start gap-1 text-sm text-ink/55">
              <PinIcon />
              <span className="truncate">{item.location}</span>
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end justify-center text-sm leading-tight text-ink">
          {item.timed && startClock ? (
            <>
              <span className="font-medium">{startClock}</span>
              {endClock && item.endMin > item.startMin ? (
                <span className="text-ink/45">{endClock}</span>
              ) : null}
            </>
          ) : (
            <span className="max-w-[5.5rem] text-right text-ink/55">Time not set</span>
          )}
        </div>
      </div>
    </Link>
  );
}

const SWIPE_MIN_PX = 50;
const WHEEL_MIN_PX = 60;
const WHEEL_IDLE_MS = 250;
const WHEEL_SLOW_PX = 3;
const WHEEL_PUSH_PX = 10;

function DaySwipeArea({ onSwipe, children }: { onSwipe: (step: 1 | -1) => void; children: React.ReactNode }) {
  const swipe = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const area = useRef<HTMLDivElement>(null);
  const onSwipeRef = useRef(onSwipe);
  useEffect(() => {
    onSwipeRef.current = onSwipe;
  });

  useEffect(() => {
    const node = area.current;
    if (!node) return;
    let travel = 0;
    let spentStep: 1 | -1 | null = null;
    let slowed = false;
    let idle: ReturnType<typeof setTimeout> | undefined;
    function onWheel(wheel: WheelEvent) {
      if (wheel.deltaX === 0 || Math.abs(wheel.deltaX) <= Math.abs(wheel.deltaY)) return;
      wheel.preventDefault();
      clearTimeout(idle);
      idle = setTimeout(() => {
        travel = 0;
        spentStep = null;
      }, WHEEL_IDLE_MS);
      const step = wheel.deltaX > 0 ? 1 : -1;
      const speed = Math.abs(wheel.deltaX);
      if (spentStep === step) {
        if (speed <= WHEEL_SLOW_PX) slowed = true;
        if (!slowed || speed < WHEEL_PUSH_PX) return;
      }
      if (spentStep !== null || Math.sign(travel) === -step) {
        spentStep = null;
        travel = 0;
      }
      slowed = false;
      travel += wheel.deltaX;
      if (Math.abs(travel) < WHEEL_MIN_PX) return;
      spentStep = step;
      travel = 0;
      onSwipeRef.current(step);
    }
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      clearTimeout(idle);
      node.removeEventListener("wheel", onWheel);
    };
  }, []);

  return (
    <div
      ref={area}
      className="touch-pan-y"
      onPointerDown={(pointer) => {
        swiped.current = false;
        if (pointer.button !== 0) return;
        swipe.current = { pointerId: pointer.pointerId, x: pointer.clientX, y: pointer.clientY };
      }}
      onPointerUp={(pointer) => {
        const start = swipe.current;
        swipe.current = null;
        if (!start || start.pointerId !== pointer.pointerId) return;
        const dx = pointer.clientX - start.x;
        const dy = pointer.clientY - start.y;
        if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        swiped.current = true;
        onSwipe(dx < 0 ? 1 : -1);
      }}
      onPointerCancel={() => {
        swipe.current = null;
      }}
      onClickCapture={(click) => {
        if (!swiped.current) return;
        swiped.current = false;
        click.preventDefault();
        click.stopPropagation();
      }}
    >
      {children}
    </div>
  );
}

function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-0.5 shrink-0">
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="10" r="2.2" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function assignmentSegmentTone(assignment: JobAssignment): SegmentTone {
  if (assignment.status === "CONFIRMED") return "confirmed";
  return "pending";
}

function buildScheduleDayList(input: {
  date: string;
  cleanerIds: string[];
  cleaners: CleanerProfile[];
  jobs: Job[];
  assignments: JobAssignment[];
  series: RecurringSeries[];
}): { timed: ScheduleDayItem[]; untimed: ScheduleDayItem[] } {
  type JobBucket = {
    job: Job;
    staffed: Array<{ assignment: JobAssignment; cleaner: CleanerProfile }>;
  };
  const buckets = new Map<string, JobBucket>();

  for (const cleanerId of input.cleanerIds) {
    const cleaner = input.cleaners.find((item) => item.cleanerId === cleanerId);
    if (!cleaner) continue;
    for (const assignment of input.assignments.filter((item) => item.cleanerId === cleanerId)) {
      const job = input.jobs.find((item) => item.jobId === assignment.jobId);
      if (!job || job.date !== input.date || !STAFFED_STATUSES.has(assignment.status)) continue;
      const bucket = buckets.get(job.jobId) ?? { job, staffed: [] };
      bucket.staffed.push({ assignment, cleaner });
      buckets.set(job.jobId, bucket);
    }
  }

  for (const job of input.jobs) {
    if (job.date !== input.date || job.status === "CANCELED") continue;
    if (input.assignments.some((assignment) => assignment.jobId === job.jobId && STAFFED_STATUSES.has(assignment.status))) {
      continue;
    }
    if (!buckets.has(job.jobId)) buckets.set(job.jobId, { job, staffed: [] });
  }

  const timed: ScheduleDayItem[] = [];
  const untimed: ScheduleDayItem[] = [];

  for (const [jobId, bucket] of buckets) {
    const { job, staffed } = bucket;
    const href = `/admin/jobs/${jobId}?from=schedule`;
    const location = job.snapshot.streetAddress;

    if (staffed.length === 0) {
      const title = job.snapshot.customerDisplayName;
      const series = job.seriesId ? input.series.find((item) => item.seriesId === job.seriesId) : undefined;
      const arrivalStart = job.arrivalWindowStart ?? series?.defaultArrivalWindowStart;
      const arrivalEnd = job.arrivalWindowEnd ?? series?.defaultArrivalWindowEnd;
      const visitDuration = job.expectedDurationMinutes ?? series?.defaultExpectedDurationMinutes;
      const hasArrival = Boolean(arrivalStart && arrivalEnd && !isUnsetArrival(arrivalStart, arrivalEnd));
      const span =
        hasArrival && hasKnownDurationMinutes(visitDuration)
          ? calculateBlockedRange({
              date: job.date,
              arrivalWindowStart: arrivalStart!,
              arrivalWindowEnd: arrivalEnd!,
              expectedDurationMinutes: visitDuration!,
            }).spans.find((item) => item.date === input.date)
          : hasArrival
            ? {
                date: job.date,
                startMin: minutesFromTime(arrivalStart!),
                endMin: minutesFromTime(arrivalEnd!),
              }
            : undefined;
      const item: ScheduleDayItem = {
        jobId,
        href,
        title,
        subtitle: "No cleaner assigned",
        location,
        startMin: span?.startMin ?? 0,
        endMin: span?.endMin ?? 0,
        segments: ["unassigned"],
        timed: Boolean(span),
      };
      if (item.timed) timed.push(item);
      else untimed.push(item);
      continue;
    }

    staffed.sort((a, b) =>
      personName(a.cleaner.firstName, a.cleaner.lastName).localeCompare(
        personName(b.cleaner.firstName, b.cleaner.lastName),
      ),
    );
    const segments = staffed.map(({ assignment }) => assignmentSegmentTone(assignment));
    let startMin = 24 * 60;
    let endMin = 0;
    let hasStart = false;
    for (const { assignment } of staffed) {
      if (isUnsetArrival(assignment.arrivalWindowStart, assignment.arrivalWindowEnd)) continue;
      if (!assignment.arrivalWindowStart || !assignment.arrivalWindowEnd) continue;
      const arrivalStart = minutesFromTime(assignment.arrivalWindowStart);
      hasStart = true;
      startMin = Math.min(startMin, arrivalStart);
      if (hasKnownDurationMinutes(assignment.expectedDurationMinutes)) {
        const span = calculateBlockedRange({
          date: job.date,
          arrivalWindowStart: assignment.arrivalWindowStart,
          arrivalWindowEnd: assignment.arrivalWindowEnd,
          expectedDurationMinutes: assignment.expectedDurationMinutes,
        }).spans.find((item) => item.date === input.date);
        if (span) {
          startMin = Math.min(startMin, span.startMin);
          endMin = Math.max(endMin, span.endMin);
        }
      } else {
        endMin = Math.max(endMin, minutesFromTime(assignment.arrivalWindowEnd));
      }
    }
    if (!hasStart) {
      const series = job.seriesId ? input.series.find((item) => item.seriesId === job.seriesId) : undefined;
      const arrivalStart = job.arrivalWindowStart ?? series?.defaultArrivalWindowStart;
      const arrivalEnd = job.arrivalWindowEnd ?? series?.defaultArrivalWindowEnd;
      if (arrivalStart && arrivalEnd && !isUnsetArrival(arrivalStart, arrivalEnd)) {
        hasStart = true;
        startMin = minutesFromTime(arrivalStart);
        const visitDuration = job.expectedDurationMinutes ?? series?.defaultExpectedDurationMinutes;
        if (hasKnownDurationMinutes(visitDuration)) {
          const span = calculateBlockedRange({
            date: job.date,
            arrivalWindowStart: arrivalStart,
            arrivalWindowEnd: arrivalEnd,
            expectedDurationMinutes: visitDuration!,
          }).spans.find((item) => item.date === input.date);
          if (span) {
            startMin = span.startMin;
            endMin = span.endMin;
          }
        } else {
          endMin = minutesFromTime(arrivalEnd);
        }
      }
    }

    const allConfirmed = staffed.every(({ assignment }) => assignment.status === "CONFIRMED");
    const statusNote = allConfirmed
      ? undefined
      : [
          ...new Set(
            staffed
              .filter(({ assignment }) => assignment.status !== "CONFIRMED")
              .map(({ assignment }) => pendingLabel(assignment)),
          ),
        ].join(" · ") || undefined;

    const item: ScheduleDayItem = {
      jobId,
      href,
      title: job.snapshot.customerDisplayName,
      serviceTypeLabel: serviceLabel(job.serviceType),
      staffNames: scheduleDayStaffNames(staffed),
      statusNote,
      location,
      startMin: hasStart ? startMin : 0,
      endMin: hasStart ? endMin : 0,
      segments,
      timed: hasStart,
    };
    if (item.timed) timed.push(item);
    else untimed.push(item);
  }

  timed.sort((a, b) => a.startMin - b.startMin || a.title.localeCompare(b.title));
  untimed.sort((a, b) => a.title.localeCompare(b.title));
  return { timed, untimed };
}

function scheduleDayStaffNames(staffed: Array<{ cleaner: CleanerProfile }>): string | undefined {
  const names = staffed
    .map(({ cleaner }) => cleaner.firstName.trim())
    .filter((name) => name.length > 0);
  if (names.length === 0) return undefined;
  return names.join(" & ");
}

function pendingLabel(assignment: JobAssignment): string {
  if (assignment.status === "CONFIRMED") return "Confirmed";
  if (assignment.attentionReason) return assignment.attentionReason;
  if (assignment.status === "NEEDS_ATTENTION") return "Needs attention";
  if (assignment.status === "INVITED") return "Invitation pending";
  return "Assigned";
}

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

function monthTitle(date: string): string {
  const { year, month, day } = { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)), day: Number(date.slice(8, 10)) };
  return new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function shortMonthTitle(monthStart: string): string {
  const year = Number(monthStart.slice(0, 4));
  const month = Number(monthStart.slice(5, 7));
  return new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1, 12)));
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

function useDatesWithScheduledJobs(jobs: Job[]) {
  return useMemo(() => {
    const dates = new Set<string>();
    for (const job of jobs) {
      if (job.status === "CANCELED") continue;
      dates.add(job.date);
    }
    return dates;
  }, [jobs]);
}

function MonthView({
  date,
  today,
  jobs,
  onPickDay,
}: {
  date: string;
  today: string;
  jobs: Job[];
  onPickDay: (date: string) => void;
}) {
  const hub = useHub();
  const scheduled = useDatesWithScheduledJobs(jobs);
  const scroller = useRef<HTMLDivElement>(null);
  const focus = firstOfMonth(date);
  const months = [-2, -1, 0, 1, 2, 3].map((delta) => shiftMonth(focus, delta));

  useEffect(() => {
    if (!hub.ready) return;
    for (const delta of [-2, -1, 0, 1, 2, 3]) {
      void hub.ensureScheduleJobsForMonth(shiftMonth(focus, delta));
    }
  }, [hub.ready, focus, hub.ensureScheduleJobsForMonth]);

  useLayoutEffect(() => {
    const node = scroller.current;
    const target = node?.querySelector<HTMLElement>(`[data-month="${date.slice(0, 7)}"]`);
    if (!node || !target) return;
    node.scrollTop += target.getBoundingClientRect().top - node.getBoundingClientRect().top;
  }, [date]);

  useEffect(() => {
    const node = scroller.current;
    if (!node || !hub.ready) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const month = entry.target.getAttribute("data-month");
          if (month) void hub.ensureScheduleJobsForMonth(`${month}-01`);
        }
      },
      { root: node, rootMargin: "120px 0px", threshold: 0 },
    );
    const sections = node.querySelectorAll("[data-month]");
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [focus, hub.ready, hub.ensureScheduleJobsForMonth]);

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
                        aria-current={day === today ? "date" : undefined}
                        className="flex min-h-12 flex-col items-center justify-center text-sm text-ink"
                      >
                        <span
                          className={`flex size-8 items-center justify-center rounded-full ${day === today ? "bg-mint font-semibold" : ""
                            }`}
                        >
                          {Number(day.slice(8))}
                        </span>
                        <span className="mt-0.5 flex h-1.5 items-center justify-center gap-0.5" aria-hidden="true">
                          {scheduled.has(day) ? <span className="size-1.5 rounded-full bg-gold" /> : null}
                          {!scheduled.has(day) ? <span className="size-1.5" /> : null}
                        </span>
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


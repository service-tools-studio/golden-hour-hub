"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useHub } from "@/components/hub-provider";
import { Card, PageHeader, Screen } from "@/components/ui";
import { personName } from "@/lib/domain/cleaners";
import {
  subtractConfirmedBookingsFromAvailability,
  toAssignmentSchedule,
} from "@/lib/domain/scheduling";
import {
  addDays,
  dayOfWeek,
  eachDate,
  formatMonthDay,
  formatTimeLabel,
  sundayOf,
} from "@/lib/domain/time";
import { formatJobSpan, serviceLabel } from "@/lib/format";

type View = "day" | "month";

export function ScheduleView({ initialDate }: { initialDate?: string }) {
  const hub = useHub();
  const [view, setView] = useState<View>("month");
  const [date, setDate] = useState(initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : hub.today);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const cleaners = hub.cleaners.filter((cleaner) => cleaner.status === "ACTIVE");
  const showingAll = selectedIds.length === 0;
  const visible = showingAll ? cleaners : cleaners.filter((cleaner) => selectedIds.includes(cleaner.cleanerId));

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
      <PageHeader title="Schedule" subtitle="Availability and confirmed jobs" />
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
    </Screen>
  );
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
      <div className="space-y-4">
        {cleanerIds.map((cleanerId) => (
          <CleanerDay key={cleanerId} cleanerId={cleanerId} date={date} />
        ))}
      </div>
    </div>
  );
}

function CleanerDay({ cleanerId, date }: { cleanerId: string; date: string }) {
  const hub = useHub();
  const cleaner = hub.cleaners.find((item) => item.cleanerId === cleanerId);
  const agenda = useCleanerAgenda(cleanerId);
  if (!cleaner || !agenda) return null;
  const windows = agenda.effective.filter((window) => window.date === date);
  const confirmed = agenda.confirmed.filter((item) => item.serviceDate === date);
  const invited = agenda.invited.filter((item) => item.serviceDate === date);
  return (
    <Card>
      <p className="text-lg font-semibold">{personName(cleaner.firstName, cleaner.lastName)}</p>
      {windows.length === 0 && confirmed.length === 0 ? (
        <p className="mt-2 text-sm text-ink/60">No availability submitted for this day.</p>
      ) : null}
      <div className="mt-3 space-y-2">
        {windows.map((window) => {
          const params = new URLSearchParams({
            cleanerId,
            date,
            start: window.start,
            end: window.end,
          });
          return (
            <Link
              key={`${window.start}-${window.end}`}
              href={`/admin/jobs/new?${params}`}
              className="block rounded-2xl bg-mint/70 px-3 py-3 text-sm"
            >
              Available {formatTimeLabel(window.start)} – {formatTimeLabel(window.end)}
            </Link>
          );
        })}
        {confirmed.map((assignment) => {
          const job = hub.jobs.find((item) => item.jobId === assignment.jobId);
          if (!job) return null;
          return (
            <Link key={assignment.assignmentId} href={`/admin/jobs/${job.jobId}`} className="block rounded-2xl bg-ink px-3 py-3 text-cream">
              <p className="font-semibold">{job.snapshot.customerDisplayName}</p>
              <p className="text-sm text-cream/80">
                {serviceLabel(job.serviceType)} ·{" "}
                {formatJobSpan({
                  date: assignment.serviceDate,
                  arrivalWindowStart: assignment.arrivalWindowStart,
                  arrivalWindowEnd: assignment.arrivalWindowEnd,
                  expectedDurationMinutes: assignment.expectedDurationMinutes,
                })}
              </p>
            </Link>
          );
        })}
        {invited.map((assignment) => {
          const job = hub.jobs.find((item) => item.jobId === assignment.jobId);
          if (!job) return null;
          return (
            <Link
              key={assignment.assignmentId}
              href={`/admin/jobs/${job.jobId}`}
              className="block rounded-2xl border border-dashed border-ink/20 px-3 py-3 text-sm text-ink/70"
            >
              {assignment.status === "PENDING_AVAILABILITY"
                ? `Waiting for ${cleaner.firstName} to confirm`
                : assignment.status === "NEEDS_ATTENTION"
                  ? "Needs attention"
                  : "Invitation pending"}
              {" · "}
              {job.snapshot.customerDisplayName}
              <span className="mt-1 block text-ink/55">
                {formatJobSpan({
                  date: assignment.serviceDate,
                  arrivalWindowStart: assignment.arrivalWindowStart,
                  arrivalWindowEnd: assignment.arrivalWindowEnd,
                  expectedDurationMinutes: assignment.expectedDurationMinutes,
                })}
              </span>
              {assignment.attentionReason ? <span className="mt-1 block">{assignment.attentionReason}</span> : null}
            </Link>
          );
        })}
      </div>
    </Card>
  );
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

function useCleanerAgenda(cleanerId: string) {
  const hub = useHub();
  return useMemo(() => {
    const own = hub.assignments.filter((assignment) => assignment.cleanerId === cleanerId);
    const windows = hub.availability
      .filter((window) => window.cleanerId === cleanerId)
      .map((window) => ({ date: window.date, start: window.start, end: window.end }));
    const confirmed = own.filter((assignment) => assignment.status === "CONFIRMED");
    return {
      effective: subtractConfirmedBookingsFromAvailability(windows, confirmed.map(toAssignmentSchedule)),
      confirmed,
      invited: own.filter(
        (assignment) =>
          assignment.status === "INVITED" ||
          assignment.status === "PENDING_AVAILABILITY" ||
          assignment.status === "NEEDS_ATTENTION",
      ),
    };
  }, [hub.assignments, hub.availability, cleanerId]);
}

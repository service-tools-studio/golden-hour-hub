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
  formatMonthName,
  formatMonthYear,
  formatTimeLabel,
  sundayOf,
} from "@/lib/domain/time";
import { formatJobSpan, relativeDay, serviceLabel } from "@/lib/format";

type View = "day" | "week" | "month";

export function ScheduleView({ initialDate }: { initialDate?: string }) {
  const hub = useHub();
  const [view, setView] = useState<View>("day");
  const [date, setDate] = useState(initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : hub.today);
  const [cleanerId, setCleanerId] = useState("all");
  const cleaners = hub.cleaners.filter((cleaner) => cleaner.status === "ACTIVE");
  const visible = cleanerId === "all" ? cleaners : cleaners.filter((cleaner) => cleaner.cleanerId === cleanerId);

  return (
    <Screen>
      <PageHeader title="Schedule" subtitle="Availability and confirmed jobs" />
      <div className="space-y-4 px-5 pt-4">
        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-white p-1">
          {(["day", "week", "month"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setView(option)}
              className={`min-h-11 rounded-xl text-sm font-semibold capitalize ${
                view === option ? "bg-ink text-cream" : "text-ink/70"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <FilterChip active={cleanerId === "all"} onClick={() => setCleanerId("all")} label="All" />
          {cleaners.map((cleaner) => (
            <FilterChip
              key={cleaner.cleanerId}
              active={cleanerId === cleaner.cleanerId}
              onClick={() => setCleanerId(cleaner.cleanerId)}
              label={cleaner.firstName}
            />
          ))}
        </div>
        {view === "day" ? <DayView date={date} cleanerIds={visible.map((cleaner) => cleaner.cleanerId)} onDate={setDate} /> : null}
        {view === "week" ? (
          <WeekView
            date={date}
            cleanerIds={visible.map((cleaner) => cleaner.cleanerId)}
            onPickDay={(next) => {
              setDate(next);
              setView("day");
            }}
          />
        ) : null}
        {view === "month" ? (
          <MonthView
            date={date}
            onPickDay={(next) => {
              setDate(next);
              setView("day");
            }}
            cleanerIds={visible.map((cleaner) => cleaner.cleanerId)}
            onPickWeek={(next) => {
              setDate(next);
              setView("week");
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
}: {
  date: string;
  cleanerIds: string[];
  onDate: (date: string) => void;
}) {
  const hub = useHub();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button type="button" className="min-h-11 min-w-11 rounded-full bg-white text-lg" onClick={() => onDate(addDays(date, -1))}>
          ‹
        </button>
        <p className="text-base font-semibold">{relativeDay(date, hub.today)} · {formatMonthDay(date)}</p>
        <button type="button" className="min-h-11 min-w-11 rounded-full bg-white text-lg" onClick={() => onDate(addDays(date, 1))}>
          ›
        </button>
      </div>
      {cleanerIds.map((cleanerId) => (
        <CleanerDay key={cleanerId} cleanerId={cleanerId} date={date} />
      ))}
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
        {windows.map((window) => (
          <div key={`${window.start}-${window.end}`} className="rounded-2xl bg-mint/70 px-3 py-3 text-sm">
            Available {formatTimeLabel(window.start)} – {formatTimeLabel(window.end)}
          </div>
        ))}
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
            <p key={assignment.assignmentId} className="rounded-2xl border border-dashed border-ink/20 px-3 py-3 text-sm text-ink/70">
              Invitation pending · {job.snapshot.customerDisplayName}
              <span className="mt-1 block text-ink/55">
                {formatJobSpan({
                  date: assignment.serviceDate,
                  arrivalWindowStart: assignment.arrivalWindowStart,
                  arrivalWindowEnd: assignment.arrivalWindowEnd,
                  expectedDurationMinutes: assignment.expectedDurationMinutes,
                })}
              </span>
            </p>
          );
        })}
      </div>
    </Card>
  );
}

function weekStarts(anchor: string, before: number, after: number): string[] {
  const first = addDays(anchor, -7 * before);
  return Array.from({ length: before + after + 1 }, (_, index) => addDays(first, index * 7));
}

function monthGroups(starts: string[]): { month: string; days: string[] }[] {
  const groups: { month: string; days: string[] }[] = [];
  for (const start of starts) {
    for (const day of eachDate(start, addDays(start, 6))) {
      const month = day.slice(0, 7);
      const last = groups[groups.length - 1];
      if (!last || last.month !== month) groups.push({ month, days: [day] });
      else last.days.push(day);
    }
  }
  return groups;
}

function rowsForWeek(start: string): { key: string; week: string; month: string; days: (string | null)[]; opensMonth: boolean }[] {
  const days = eachDate(start, addDays(start, 6));
  const rows: { key: string; week: string; month: string; days: (string | null)[]; opensMonth: boolean }[] = [];
  let month = "";
  let slots: (string | null)[] = Array(7).fill(null);
  days.forEach((day, index) => {
    const nextMonth = day.slice(0, 7);
    if (month && nextMonth !== month) {
      rows.push({ key: `${start}-${month}`, week: start, month, days: slots, opensMonth: slots.some((item) => item?.endsWith("-01")) });
      slots = Array(7).fill(null);
    }
    month = nextMonth;
    slots[index] = day;
  });
  if (month) {
    rows.push({ key: `${start}-${month}`, week: start, month, days: slots, opensMonth: slots.some((item) => item?.endsWith("-01")) });
  }
  return rows;
}

function alignChild(node: HTMLElement, target: HTMLElement, axis: "x" | "y", inset = 0) {
  const nodeBox = node.getBoundingClientRect();
  const targetBox = target.getBoundingClientRect();
  if (axis === "x") node.scrollLeft += targetBox.left - nodeBox.left - inset;
  else node.scrollTop += targetBox.top - nodeBox.top - inset;
}

function WeekView({
  date,
  cleanerIds,
  onPickDay,
}: {
  date: string;
  cleanerIds: string[];
  onPickDay: (date: string) => void;
}) {
  const anchor = sundayOf(date);
  const scroller = useRef<HTMLDivElement>(null);
  const ready = useRef(false);
  const lock = useRef(false);
  const pendingWidth = useRef<number | null>(null);
  const [before, setBefore] = useState(4);
  const [after, setAfter] = useState(6);
  const starts = weekStarts(anchor, before, after);
  const groups = monthGroups(starts);

  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) return;
    if (!ready.current) {
      const target = node.querySelector(`[data-date="${date}"]`);
      if (target instanceof HTMLElement) alignChild(node, target, "x");
      ready.current = true;
      return;
    }
    if (pendingWidth.current != null) {
      node.scrollLeft += node.scrollWidth - pendingWidth.current;
      pendingWidth.current = null;
    }
    lock.current = false;
  });

  function onScroll() {
    const node = scroller.current;
    if (!node || !ready.current || lock.current) return;
    if (node.scrollLeft < 180) {
      lock.current = true;
      pendingWidth.current = node.scrollWidth;
      setBefore((count) => count + 4);
      return;
    }
    if (node.scrollWidth - node.scrollLeft - node.clientWidth < 180) {
      lock.current = true;
      setAfter((count) => count + 4);
    }
  }

  return (
    <div ref={scroller} onScroll={onScroll} className="overflow-x-auto pb-2">
      <div className="flex w-max gap-2">
        {groups.map((group) => (
          <section key={group.month} className="shrink-0">
            <p className="sticky left-0 z-10 w-max bg-cream pr-3 text-sm font-semibold text-ink">
              {formatMonthYear(`${group.month}-01`)}
            </p>
            <div className="mt-2 flex gap-2">
              {group.days.map((day) => (
                <button
                  key={day}
                  type="button"
                  data-date={day}
                  onClick={() => onPickDay(day)}
                  className="min-h-36 w-[5.25rem] shrink-0 rounded-2xl bg-white p-2 text-left"
                >
                  <p className="text-xs font-semibold uppercase text-ink/50">{dayOfWeek(day).slice(0, 3)}</p>
                  <p className="text-sm font-semibold">{formatMonthDay(day)}</p>
                  <WeekMarks date={day} cleanerIds={cleanerIds} />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function WeekMarks({ date, cleanerIds }: { date: string; cleanerIds: string[] }) {
  const hub = useHub();
  const jobs = hub.assignments.filter(
    (assignment) =>
      assignment.serviceDate === date &&
      assignment.status === "CONFIRMED" &&
      cleanerIds.includes(assignment.cleanerId),
  );
  const available = cleanerIds.some((cleanerId) => {
    const windows = hub.availability
      .filter((window) => window.cleanerId === cleanerId)
      .map((window) => ({ date: window.date, start: window.start, end: window.end }));
    const confirmed = hub.assignments.filter(
      (assignment) => assignment.cleanerId === cleanerId && assignment.status === "CONFIRMED",
    );
    return subtractConfirmedBookingsFromAvailability(windows, confirmed.map(toAssignmentSchedule)).some(
      (window) => window.date === date,
    );
  });
  return (
    <div className="mt-2 space-y-1">
      {jobs.slice(0, 3).map((assignment) => {
        const job = hub.jobs.find((item) => item.jobId === assignment.jobId);
        return (
          <p key={assignment.assignmentId} className="truncate rounded-lg bg-ink px-1.5 py-1 text-[11px] text-cream">
            {job?.snapshot.customerDisplayName.split(" ")[0]}
          </p>
        );
      })}
      {available || jobs.length === 0 ? (
        <p
          className={`rounded-full px-1.5 py-1 text-center text-[10px] font-semibold leading-tight ${
            available ? "bg-mint text-ink" : "bg-ink/10 text-ink/55"
          }`}
        >
          {available ? "cleaners available" : "no cleaners available"}
        </p>
      ) : null}
    </div>
  );
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
  onPickWeek,
}: {
  date: string;
  cleanerIds: string[];
  onPickDay: (date: string) => void;
  onPickWeek: (date: string) => void;
}) {
  const anchor = sundayOf(date);
  const openings = useDatesWithCleanerOpenings(cleanerIds);
  const scroller = useRef<HTMLDivElement>(null);
  const ready = useRef(false);
  const lock = useRef(false);
  const pendingHeight = useRef<number | null>(null);
  const [before, setBefore] = useState(8);
  const [after, setAfter] = useState(16);
  const [heading, setHeading] = useState(anchor);
  const header = useRef<HTMLDivElement>(null);
  const rows = weekStarts(anchor, before, after).flatMap((start) => rowsForWeek(start));

  function headerEdge(node: HTMLElement) {
    return node.getBoundingClientRect().top + (header.current?.offsetHeight ?? 0);
  }

  function monthInView(node: HTMLElement) {
    const edge = headerEdge(node);
    for (const row of node.querySelectorAll<HTMLElement>("[data-month]")) {
      if (row.getBoundingClientRect().bottom <= edge) continue;
      const month = row.dataset.month;
      return month ? `${month}-01` : heading;
    }
    return heading;
  }

  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) return;
    if (!ready.current) {
      const target = node.querySelector(`[data-date="${date}"]`)?.closest("[data-week]");
      if (target instanceof HTMLElement) alignChild(node, target, "y", header.current?.offsetHeight ?? 0);
      ready.current = true;
      return;
    }
    if (pendingHeight.current != null) {
      node.scrollTop += node.scrollHeight - pendingHeight.current;
      pendingHeight.current = null;
    }
    lock.current = false;
  });

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const visible = monthInView(node);
    if (visible.slice(0, 7) !== heading.slice(0, 7)) setHeading(visible);
  }, [before, after, heading]);

  function onScroll() {
    const node = scroller.current;
    if (!node || !ready.current) return;
    const visible = monthInView(node);
    if (visible.slice(0, 7) !== heading.slice(0, 7)) setHeading(visible);
    if (lock.current) return;
    if (node.scrollTop < 160) {
      lock.current = true;
      pendingHeight.current = node.scrollHeight;
      setBefore((count) => count + 8);
      return;
    }
    if (node.scrollHeight - node.scrollTop - node.clientHeight < 240) {
      lock.current = true;
      setAfter((count) => count + 8);
    }
  }

  return (
    <div ref={scroller} onScroll={onScroll} className="max-h-[calc(100dvh-20rem)] overflow-y-auto pb-4">
      <div ref={header} className="sticky top-0 z-10 bg-cream pb-1">
        <p className="pb-1 text-sm font-semibold">{formatMonthYear(heading)}</p>
        <div className="grid grid-cols-[2rem_repeat(7,minmax(0,1fr))] gap-1">
          <span />
          {["S", "M", "T", "W", "T", "F", "S"].map((label, index) => (
            <p key={`${label}-${index}`} className="text-center text-xs font-semibold text-ink/40">
              {label}
            </p>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {rows.map((row, index) => {
          const openOn = row.days.find((day) => day?.endsWith("-01")) ?? row.week;
          return (
          <div
            key={row.key}
            data-week={row.week}
            data-month={row.month}
            className={`grid grid-cols-[2rem_repeat(7,minmax(0,1fr))] gap-1 ${row.opensMonth && index > 0 ? "mt-2" : ""}`}
          >
            <button
              type="button"
              aria-label={`Week of ${formatMonthDay(openOn)}`}
              onClick={() => onPickWeek(openOn)}
              className="flex min-h-12 items-center justify-center rounded-xl bg-mint/50 text-ink/70"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {row.days.map((day, dayIndex) =>
              day ? (
                <button
                  key={day}
                  type="button"
                  data-date={day}
                  onClick={() => onPickDay(day)}
                  className="relative flex min-h-12 flex-col items-center justify-center rounded-xl bg-white text-sm text-ink"
                >
                  <span className={`text-[10px] font-semibold leading-3 ${day.endsWith("-01") ? "" : "invisible"}`}>{formatMonthName(day)}</span>
                  {Number(day.slice(8))}
                  {openings.has(day) ? <span className="absolute bottom-1 size-1.5 rounded-full bg-mint" aria-hidden="true" /> : null}
                </button>
              ) : (
                <span key={`${row.key}-empty-${dayIndex}`} />
              ),
            )}
          </div>
          );
        })}
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
      invited: own.filter((assignment) => assignment.status === "INVITED"),
    };
  }, [hub.assignments, hub.availability, cleanerId]);
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
  mondayOf,
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
            </p>
          );
        })}
      </div>
    </Card>
  );
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
  const start = mondayOf(date);
  const days = eachDate(start, addDays(start, 6));
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-[40rem] gap-2">
        {days.map((day) => (
          <button
            key={day}
            type="button"
            onClick={() => onPickDay(day)}
            className="min-h-36 flex-1 rounded-2xl bg-white p-2 text-left"
          >
            <p className="text-xs font-semibold uppercase text-ink/50">{dayOfWeek(day).slice(0, 3)}</p>
            <p className="text-sm font-semibold">{formatMonthDay(day)}</p>
            <WeekMarks date={day} cleanerIds={cleanerIds} />
          </button>
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
      {jobs.length === 0 ? <p className="text-[11px] text-ink/40">Open</p> : null}
    </div>
  );
}

function MonthView({ date, onPickDay }: { date: string; onPickDay: (date: string) => void }) {
  const [year, month] = date.split("-").map(Number);
  const first = `${date.slice(0, 7)}-01`;
  const gridStart = mondayOf(first);
  const days = eachDate(gridStart, addDays(gridStart, 41));
  return (
    <div className="grid grid-cols-7 gap-1">
      {["M", "T", "W", "T", "F", "S", "S"].map((label, index) => (
        <p key={`${label}-${index}`} className="pb-1 text-center text-xs font-semibold text-ink/40">
          {label}
        </p>
      ))}
      {days.map((day) => {
        const inMonth = Number(day.slice(5, 7)) === month && Number(day.slice(0, 4)) === year;
        return (
          <button
            key={day}
            type="button"
            onClick={() => onPickDay(day)}
            className={`min-h-12 rounded-xl text-sm ${inMonth ? "bg-white text-ink" : "text-ink/30"}`}
          >
            {Number(day.slice(8))}
          </button>
        );
      })}
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

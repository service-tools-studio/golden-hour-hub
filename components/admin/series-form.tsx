"use client";

import { useImperativeHandle, useRef, useState } from "react";
import { useHub } from "@/components/hub-provider";
import { Field, fieldClass } from "@/components/ui";
import type { CustomerFormHandle } from "@/components/admin/customer-form";
import { validateRecurrenceRule } from "@/lib/domain/recurrence";
import type { DayOfWeek, Property, RecurringSeries, SeriesStatus } from "@/lib/domain/types";

const DAYS: { id: DayOfWeek; label: string }[] = [
  { id: "MONDAY", label: "Mon" },
  { id: "TUESDAY", label: "Tue" },
  { id: "WEDNESDAY", label: "Wed" },
  { id: "THURSDAY", label: "Thu" },
  { id: "FRIDAY", label: "Fri" },
  { id: "SATURDAY", label: "Sat" },
  { id: "SUNDAY", label: "Sun" },
];

const INTERVALS = [
  { value: 1, label: "Every week" },
  { value: 2, label: "Every 2 weeks" },
  { value: 4, label: "Every 4 weeks" },
];

function propertyLabel(home: Property) {
  return home.label ? `${home.label} · ${home.streetAddress}` : home.streetAddress;
}

export function SeriesForm({
  series,
  homes,
  onCancel,
  onSaved,
  ref,
}: {
  series: RecurringSeries;
  homes: Property[];
  onCancel?: () => void;
  onSaved?: () => void;
  ref?: React.Ref<CustomerFormHandle>;
}) {
  const hub = useHub();
  const weekly = series.recurrence.frequency === "WEEK";
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    propertyId: series.propertyId,
    interval: series.recurrence.interval,
    days: series.recurrence.daysOfWeek ?? [],
    headcount: series.defaultHeadcountNeeded,
    status: series.status,
  });
  const initial = useRef(form);
  const latest = useRef(form);
  latest.current = form;

  function toggleDay(day: DayOfWeek) {
    setForm((current) => ({
      ...current,
      days: current.days.includes(day) ? current.days.filter((item) => item !== day) : [...current.days, day],
    }));
    setMessage(null);
  }

  function persist(): boolean {
    const current = latest.current;
    const recurrence = weekly
      ? { frequency: "WEEK" as const, interval: current.interval, daysOfWeek: current.days }
      : series.recurrence;
    const decision = validateRecurrenceRule(recurrence);
    if (!decision.ok) {
      setMessage(decision.message);
      return false;
    }
    const result = hub.saveSeries(series.seriesId, {
      propertyId: current.propertyId,
      recurrence,
      defaultHeadcountNeeded: current.headcount,
      status: current.status,
    });
    if (!result.ok) {
      setMessage(result.message);
      return false;
    }
    setMessage(null);
    return true;
  }

  function isDirty(): boolean {
    return JSON.stringify(latest.current) !== JSON.stringify(initial.current);
  }

  useImperativeHandle(ref, () => ({
    save: persist,
    isDirty,
  }));

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!persist()) return;
        hub.flash("changes saved");
        onSaved?.();
      }}
    >
      <Field label="Property">
        <select
          className={fieldClass}
          value={form.propertyId}
          onChange={(event) => setForm((current) => ({ ...current, propertyId: event.target.value }))}
        >
          {homes.map((home) => (
            <option key={home.propertyId} value={home.propertyId}>
              {propertyLabel(home)}
            </option>
          ))}
        </select>
      </Field>
      {weekly ? (
        <>
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink/80">Repeats</p>
            <div className="grid grid-cols-3 gap-2">
              {INTERVALS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, interval: option.value }))}
                  className={`min-h-12 rounded-2xl px-2 text-sm font-semibold ${
                    form.interval === option.value ? "bg-ink text-cream" : "bg-white text-ink"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink/80">Days</p>
            <div className="grid grid-cols-7 gap-1">
              {DAYS.map((day) => {
                const selected = form.days.includes(day.id);
                return (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => toggleDay(day.id)}
                    className={`min-h-12 rounded-2xl text-sm font-semibold ${selected ? "bg-ink text-cream" : "bg-white text-ink"}`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-sm text-ink/60">Optional. With none selected, new cleanings follow the weekday of the last one.</p>
          </div>
        </>
      ) : null}
      <div>
        <p className="mb-1.5 text-sm font-medium text-ink/80">Cleaners needed</p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Decrease cleaners needed"
            disabled={form.headcount <= 1}
            onClick={() => setForm((current) => ({ ...current, headcount: current.headcount - 1 }))}
            className="flex min-h-12 min-w-12 items-center justify-center rounded-2xl bg-white text-2xl font-semibold text-ink disabled:text-ink/25"
          >
            −
          </button>
          <p className="min-w-8 text-center text-lg font-semibold">{form.headcount}</p>
          <button
            type="button"
            aria-label="Increase cleaners needed"
            disabled={form.headcount >= 12}
            onClick={() => setForm((current) => ({ ...current, headcount: current.headcount + 1 }))}
            className="flex min-h-12 min-w-12 items-center justify-center rounded-2xl bg-white text-2xl font-semibold text-ink disabled:text-ink/25"
          >
            +
          </button>
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-sm font-medium text-ink/80">Status</p>
        <div className="grid grid-cols-2 gap-2">
          {(["ACTIVE", "INACTIVE"] as SeriesStatus[]).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setForm((current) => ({ ...current, status }))}
              className={`min-h-12 rounded-2xl text-base font-semibold ${
                form.status === status ? "bg-ink text-cream" : "bg-white text-ink"
              }`}
            >
              {status === "ACTIVE" ? "Active" : "Paused"}
            </button>
          ))}
        </div>
      </div>
      {message ? (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {message}
        </p>
      ) : null}
      <button type="submit" className="min-h-12 w-full rounded-2xl bg-ink text-base font-semibold text-cream">
        Save recurring service
      </button>
      {onCancel ? (
        <button type="button" onClick={onCancel} className="min-h-12 w-full rounded-2xl bg-cream text-base font-semibold text-ink">
          Cancel edit
        </button>
      ) : null}
    </form>
  );
}

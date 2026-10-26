"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { minutesFromTime, timeFromMinutes } from "@/lib/domain/time";
import { formatTimeLabel } from "@/lib/format";

const WHEEL_ITEM = 36;
const HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTES = Array.from({ length: 12 }, (_, index) => index * 5);

function clockParts(time: string): { hour: number; minute: number; suffix: "AM" | "PM" } {
  const total = minutesFromTime(time);
  const hour24 = Math.floor(total / 60);
  return {
    hour: hour24 % 12 === 0 ? 12 : hour24 % 12,
    minute: total % 60,
    suffix: hour24 >= 12 ? "PM" : "AM",
  };
}

function clockTime(hour: number, minute: number, suffix: "AM" | "PM"): string {
  let hour24 = hour % 12;
  if (suffix === "PM") hour24 += 12;
  return timeFromMinutes(Math.min(hour24 * 60 + minute, 23 * 60 + 55));
}

export function ArrivalWindowPicker({
  start,
  end,
  onChange,
}: {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const clock = clockParts(start);
  const minuteChoices = clock.suffix === "PM" && clock.hour === 11 ? [0] : MINUTES;

  function choose(patch: Partial<{ hour: number; minute: number; suffix: "AM" | "PM" }>) {
    const parts = { ...clock, ...patch };
    const minute = parts.suffix === "PM" && parts.hour === 11 ? 0 : parts.minute;
    const nextStart = clockTime(parts.hour, minute, parts.suffix);
    const startMin = Math.min(Math.max(minutesFromTime(nextStart), 0), 23 * 60 + 55);
    const time = timeFromMinutes(startMin);
    onChange(time, time);
  }

  return (
    <div className="rounded-3xl bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 text-sm text-ink/70">Start time</span>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${open ? "bg-gold text-ink" : "bg-ink/8 text-ink"}`}
        >
          {formatTimeLabel(start)}
        </button>
      </div>
      {open ? (
        <div className="relative mt-3">
          <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-9 -translate-y-1/2 rounded-lg bg-ink/8" />
          <div className="flex gap-2">
            <TimeWheel
              label="Hour"
              options={HOURS.map((hour) => ({ value: String(hour), label: String(hour) }))}
              value={String(clock.hour)}
              onChange={(value) => choose({ hour: Number(value) })}
            />
            <TimeWheel
              label="Minute"
              options={(minuteChoices.includes(clock.minute) ? minuteChoices : [clock.minute, ...minuteChoices].sort((a, b) => a - b)).map(
                (minute) => ({ value: String(minute), label: String(minute).padStart(2, "0") }),
              )}
              value={String(clock.minute)}
              onChange={(value) => choose({ minute: Number(value) })}
            />
            <TimeWheel
              label="AM or PM"
              options={[
                { value: "AM", label: "AM" },
                { value: "PM", label: "PM" },
              ]}
              value={clock.suffix}
              onChange={(value) => choose({ suffix: value === "PM" ? "PM" : "AM" })}
            />
          </div>
        </div>
      ) : null}
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

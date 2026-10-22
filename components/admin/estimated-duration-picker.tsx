"use client";

import { useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { fieldClass } from "@/components/ui";
import {
  ESTIMATED_ON_SITE_DURATION_MINUTES,
  formatDurationSelectLabel,
} from "@/lib/format";

function durationOptions(current: number): number[] {
  return ESTIMATED_ON_SITE_DURATION_MINUTES.includes(current)
    ? ESTIMATED_ON_SITE_DURATION_MINUTES
    : [current, ...ESTIMATED_ON_SITE_DURATION_MINUTES];
}

export function EstimatedDurationPicker({
  value,
  onChange,
  id,
}: {
  value: number;
  onChange: (minutes: number) => void;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const options = useMemo(() => durationOptions(value), [value]);

  function choose(minutes: number) {
    onChange(minutes);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        id={id}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={`${fieldClass} flex items-center justify-between gap-2 text-left`}
      >
        <span>{formatDurationSelectLabel(value)}</span>
        <ChevronDown className="shrink-0 text-ink/45" />
      </button>
      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-5 pb-28"
              onClick={() => setOpen(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="flex max-h-[min(70dvh,28rem)] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-[0_8px_30px_rgba(51,51,51,0.16)]"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="shrink-0 border-b border-ink/10 px-5 py-4">
                  <h2 id={titleId} className="text-lg font-semibold">Estimated cleaning time</h2>
                  <p className="mt-1 text-sm text-ink/60">Counted from the start of the arrival window.</p>
                </div>
                <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2" role="listbox" aria-activedescendant={`duration-${value}`}>
                  {options.map((minutes) => {
                    const selected = minutes === value;
                    return (
                      <li key={minutes} role="presentation">
                        <button
                          type="button"
                          role="option"
                          id={`duration-${minutes}`}
                          aria-selected={selected}
                          onClick={() => choose(minutes)}
                          className={`flex min-h-12 w-full items-center rounded-2xl px-4 text-base font-semibold ${
                            selected ? "bg-ink text-cream" : "text-ink hover:bg-cream"
                          }`}
                        >
                          {formatDurationSelectLabel(minutes)}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="shrink-0 border-t border-ink/10 p-3">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="min-h-12 w-full rounded-2xl bg-cream text-base font-semibold text-ink"
                  >
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

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

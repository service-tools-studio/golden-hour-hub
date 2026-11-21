"use client";

export function HeadcountStepper({
  value,
  onChange,
  min = 1,
  max = 12,
  ariaLabel = "Headcount",
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  ariaLabel?: string;
}) {
  const stepButton =
    "flex size-10 items-center justify-center rounded-full bg-mint text-lg font-semibold disabled:bg-ink/8 disabled:text-ink/25";
  return (
    <div className="flex min-h-12 items-center justify-between rounded-2xl bg-white px-2 ring-1 ring-ink/15">
      <button
        type="button"
        aria-label={`Decrease ${ariaLabel}`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className={stepButton}
      >
        −
      </button>
      <span className="text-base font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label={`Increase ${ariaLabel}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className={stepButton}
      >
        +
      </button>
    </div>
  );
}
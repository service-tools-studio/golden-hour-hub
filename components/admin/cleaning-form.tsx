"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useHub } from "@/components/hub-provider";
import { UnsavedChangesDialog, useUnsavedNavigation } from "@/components/unsaved-changes";
import { Field, Notice, PrimaryButton, fieldClass } from "@/components/ui";
import { availabilityAgainstSpan, cleaningTimeSpan } from "@/lib/domain/availability";
import { subtractConfirmedBookingsFromAvailability, toAssignmentSchedule } from "@/lib/domain/scheduling";
import { searchCustomers } from "@/lib/domain/customers";
import { addDays, eachDate, formatMonthYear, formatTimeLabel, minutesFromTime, sundayOf, timeFromMinutes } from "@/lib/domain/time";
import type { Property, ServiceType } from "@/lib/domain/types";
import { hourWindowLabel, serviceLabel } from "@/lib/format";
import { calculateQuoteEstimate, type CleanType, type QuoteEstimate } from "@/lib/portableQuoteEstimate";

const SERVICES: ServiceType[] = ["DEEP_CLEAN", "RECURRING", "MOVE_OUT", "POST_CONSTRUCTION", "OTHER"];
const DURATIONS = Array.from({ length: 12 }, (_, index) => (index + 1) * 60);

export type CleanerArrival = {
  cleanerId: string;
  firstName: string;
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
};

export type CleaningValues = {
  date: string;
  customerId: string;
  propertyId: string;
  serviceType: ServiceType;
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  expectedDurationMinutes: number;
  headcountNeeded: number;
  specialInstructions: string;
  cleanerIds: string[];
  cleanerArrivals?: CleanerArrival[];
};

function roundUpToHour(hours: number): number {
  return Math.max(1, Math.ceil(hours - 1e-9)) * 60;
}

function trimHours(hours: number): string {
  return String(Number(hours.toFixed(2)));
}

/** Spreads the quote's person-hours across the chosen headcount, to the nearest quarter hour. */
function onSiteHours(quote: QuoteEstimate, headcount: number): { low: number; high: number; text: string } {
  const spread = (hours: number) => Math.round(((hours * quote.time.cleaners) / headcount) * 4) / 4;
  const low = spread(quote.time.hoursLow);
  const high = spread(quote.time.hoursHigh);
  const unit = high === 1 ? "hour" : "hours";
  return { low, high, text: low === high ? `~${trimHours(high)} ${unit}` : `${trimHours(low)}–${trimHours(high)} ${unit}` };
}

function cleanTypeFor(service: ServiceType): CleanType | null {
  if (service === "DEEP_CLEAN") return "deep";
  if (service === "RECURRING") return "standard";
  if (service === "MOVE_OUT") return "move_out";
  return null;
}

function propertyLine(home: Property): string {
  return home.label ? `${home.label} · ${home.streetAddress}` : `${home.streetAddress}, ${home.city}`;
}

export function CleaningForm({
  initial,
  leadCleanerId = "",
  canClearCleaners = false,
  estimateOnLoad = false,
  newCustomerHref,
  onSubmit,
  onDateChange,
  afterDate,
  afterArrival,
  trailing,
}: {
  initial: CleaningValues;
  leadCleanerId?: string;
  canClearCleaners?: boolean;
  estimateOnLoad?: boolean;
  newCustomerHref: string;
  onSubmit: (values: CleaningValues, nextHref?: string) => { ok: boolean; message?: string };
  onDateChange?: (date: string) => void;
  afterDate?: (date: string) => React.ReactNode;
  afterArrival?: (start: string, end: string) => React.ReactNode;
  trailing?: React.ReactNode;
}) {
  const hub = useHub();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [date, setDate] = useState(initial.date);
  const [customerId, setCustomerId] = useState(initial.customerId);
  const [propertyId, setPropertyId] = useState(initial.propertyId);
  const [serviceType, setServiceType] = useState<ServiceType>(initial.serviceType);
  const opening = oneHourWindow(initial.arrivalWindowStart);
  const [arrivalStart, setArrivalStart] = useState(opening.start);
  const [arrivalEnd, setArrivalEnd] = useState(opening.end);
  const [picker, setPicker] = useState<"date" | "time" | null>(null);
  const [instructions, setInstructions] = useState(initial.specialInstructions);
  const [message, setMessage] = useState<string | null>(null);
  const [headcount, setHeadcount] = useState(initial.headcountNeeded > 0 ? initial.headcountNeeded : 1);
  const [duration, setDuration] = useState(initial.expectedDurationMinutes);
  const [headcountFor, setHeadcountFor] = useState(estimateOnLoad ? "" : "ready");
  const [draftCleanerIds, setDraftCleanerIds] = useState<string[]>(initial.cleanerIds);
  const [cleanerArrivals, setCleanerArrivals] = useState<CleanerArrival[]>(initial.cleanerArrivals ?? []);
  const [arrivalEditor, setArrivalEditor] = useState<string | null>(null);
  const [leaveHref, setLeaveHref] = useState<string | null>(null);

  const matches = useMemo(
    () => (query.trim() ? searchCustomers(hub.customers, hub.properties, query) : []),
    [hub.customers, hub.properties, query],
  );
  const customer = hub.customers.find((item) => item.customerId === customerId);
  const homes = hub.properties.filter((item) => item.customerId === customerId && item.status === "ACTIVE");
  const property = homes.find((home) => home.propertyId === propertyId);
  const cleanType = cleanTypeFor(serviceType);
  const quote =
    property && cleanType
      ? calculateQuoteEstimate({
          bedrooms: property.bedrooms,
          bathrooms: property.bathrooms,
          sqft: property.squareFeet,
          cleanType,
        })
      : null;
  const estimate = quote ? onSiteHours(quote, headcount) : null;
  function changeHeadcount(next: number) {
    setHeadcount(next);
    if (quote) setDuration(roundUpToHour(onSiteHours(quote, next).high));
    setMessage(null);
  }
  const suggestionKey = property && cleanType ? `${property.propertyId}:${cleanType}` : "";
  if (headcountFor !== "ready" && suggestionKey !== headcountFor) {
    setHeadcountFor(suggestionKey);
    if (quote) {
      setHeadcount(quote.time.cleaners);
      setDuration(roundUpToHour(quote.time.hoursHigh));
    } else {
      setDuration(240);
    }
  } else if (headcountFor === "ready") {
    setHeadcountFor(suggestionKey);
  }

  const formSnapshot = JSON.stringify({
    date,
    customerId,
    propertyId,
    serviceType,
    arrivalStart,
    arrivalEnd,
    instructions,
    headcount,
    duration,
    draftCleanerIds: [...draftCleanerIds].sort(),
    cleanerArrivals,
  });
  const baseline = useRef<string | null>(null);
  const settled = headcountFor === suggestionKey;
  if (baseline.current === null && settled) baseline.current = formSnapshot;
  const dirty = Boolean(customer) && baseline.current !== null && baseline.current !== formSnapshot;
  useUnsavedNavigation(settled, () => dirty, setLeaveHref);

  const roster = leadCleanerId
    ? [
        ...hub.cleaners.filter((item) => item.cleanerId === leadCleanerId),
        ...hub.cleaners.filter((item) => item.status === "ACTIVE" && item.cleanerId !== leadCleanerId),
      ]
    : hub.cleaners.filter((item) => item.status === "ACTIVE");
  function toggleDraft(id: string) {
    setMessage(null);
    if (draftCleanerIds.includes(id)) {
      if (!canClearCleaners && draftCleanerIds.length === 1) return;
      setDraftCleanerIds(draftCleanerIds.filter((item) => item !== id));
      setArrivalEditor((current) => (current === id ? null : current));
      return;
    }
    setDraftCleanerIds([...draftCleanerIds, id]);
    setCleanerArrivals((current) => {
      const person = roster.find((item) => item.cleanerId === id);
      if (!person) return current;
      const windows = hub.availability.filter((window) => window.cleanerId === id && window.date === date);
      const opening = firstOpenStart(windows, arrivalStart);
      const arrival = opening === arrivalStart ? { start: arrivalStart, end: arrivalEnd } : oneHourWindow(opening);
      return [
        ...current.filter((item) => item.cleanerId !== id),
        {
          cleanerId: id,
          firstName: person.firstName,
          arrivalWindowStart: arrival.start,
          arrivalWindowEnd: arrival.end,
        },
      ];
    });
  }

  function chooseStart(start: string) {
    const window = oneHourWindow(start);
    setArrivalStart(window.start);
    setArrivalEnd(window.end);
    setMessage(null);
  }

  function chooseCustomer(nextId: string) {
    const nextHomes = hub.properties.filter((item) => item.customerId === nextId && item.status === "ACTIVE");
    setCustomerId(nextId);
    setPropertyId(nextHomes[0]?.propertyId ?? "");
    setQuery("");
    setMessage(null);
  }

  function values(): CleaningValues {
    return {
      date,
      customerId,
      propertyId,
      serviceType,
      arrivalWindowStart: arrivalStart,
      arrivalWindowEnd: arrivalEnd,
      expectedDurationMinutes: duration,
      headcountNeeded: quote ? headcount : 0,
      specialInstructions: instructions,
      cleanerIds: draftCleanerIds,
      cleanerArrivals: cleanerArrivals.filter((arrival) => draftCleanerIds.includes(arrival.cleanerId)),
    };
  }

  function submit(nextHref?: string) {
    const result = onSubmit(values(), nextHref);
    if (!result.ok) {
      setMessage(result.message ?? "The cleaning could not be saved.");
      return false;
    }
    return true;
  }

  function saveAndLeave() {
    const href = leaveHref ?? undefined;
    if (!submit(href)) setLeaveHref(null);
  }

  return (
    <>
      <form
        className="space-y-4 px-5 pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {message ? <Notice>{message}</Notice> : null}

        {customer ? (
          <Group label="Customer">
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-3 ring-1 ring-ink/15">
              <span>
                <span className="block font-semibold">
                  {customer.firstName} {customer.lastName}
                </span>
                {property ? <span className="block text-sm text-ink/70">{propertyLine(property)}</span> : null}
              </span>
              <button type="button" className="text-sm font-semibold underline" onClick={() => setCustomerId("")}>
                Change
              </button>
            </div>
          </Group>
        ) : (
          <div className="space-y-3">
            <div className="rounded-3xl bg-white p-4 shadow-[0_8px_30px_rgba(51,51,51,0.06)]">
              <p className="text-base font-semibold">Search existing customer</p>
              <p className="mt-1 text-sm text-ink/60">Find a household already in the list.</p>
              <input
                className={`${fieldClass} mt-3`}
                placeholder="Name, phone, or address"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search existing customers"
              />
              {query.trim() ? (
                <div className="mt-3 space-y-2">
                  {matches.length === 0 ? <p className="text-sm text-ink/60">No matching customers.</p> : null}
                  {matches.map((item) => {
                    const itemHomes = hub.properties.filter((home) => home.customerId === item.customerId && home.status === "ACTIVE");
                    return (
                      <button
                        key={item.customerId}
                        type="button"
                        onClick={() => chooseCustomer(item.customerId)}
                        className="block w-full rounded-2xl bg-cream px-3 py-3 text-left"
                      >
                        <span className="block font-semibold">
                          {item.firstName} {item.lastName}
                        </span>
                        {itemHomes.map((home) => (
                          <span key={home.propertyId} className="block text-sm text-ink/70">
                            {propertyLine(home)}
                          </span>
                        ))}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <p className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-ink/40">or</p>
            <Link href={newCustomerHref} className="block rounded-3xl bg-white p-4 shadow-[0_8px_30px_rgba(51,51,51,0.06)]">
              <span className="block text-base font-semibold">Create new customer</span>
              <span className="mt-1 block text-sm text-ink/60">Add a household that is not in the list yet.</span>
            </Link>
          </div>
        )}

        {customer ? (
          <>
            {homes.length > 1 ? (
              <Group label="Property">
                <div className="flex flex-col gap-2">
                  {homes.map((home) => (
                    <button
                      key={home.propertyId}
                      type="button"
                      aria-pressed={propertyId === home.propertyId}
                      onClick={() => {
                        setPropertyId(home.propertyId);
                        setMessage(null);
                      }}
                      className={`min-h-11 rounded-2xl px-3 text-left text-sm font-semibold ${
                        propertyId === home.propertyId ? "bg-gold text-ink" : "bg-white text-ink/70"
                      }`}
                    >
                      {propertyLine(home)}
                    </button>
                  ))}
                </div>
              </Group>
            ) : null}

            <Group label="Service">
              <div className="flex flex-wrap gap-2">
                {SERVICES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={serviceType === item}
                    onClick={() => {
                      setServiceType(item);
                      setMessage(null);
                    }}
                    className={`min-h-10 rounded-full px-4 text-sm font-semibold ${
                      serviceType === item ? "bg-gold text-ink" : "bg-white text-ink/70"
                    }`}
                  >
                    {serviceLabel(item)}
                  </button>
                ))}
              </div>
            </Group>

            <ArrivalStart
              date={date}
              start={arrivalStart}
              today={hub.today}
              picker={picker}
              onPicker={(next) => {
                setArrivalEditor(null);
                setPicker(next);
              }}
              onDate={(next) => {
                setDate(next);
                setMessage(null);
                onDateChange?.(next);
              }}
              onStart={chooseStart}
            />
            {afterDate ? afterDate(date) : null}
            {afterArrival ? afterArrival(arrivalStart, arrivalEnd) : null}
            <Cleaners
              cleaners={roster}
              windows={hub.availability.filter((window) => window.date === date)}
              span={cleaningTimeSpan(arrivalStart, arrivalEnd, duration)}
              selected={draftCleanerIds}
              arrivals={cleanerArrivals}
              jobStart={arrivalStart}
              jobEnd={arrivalEnd}
              editorId={arrivalEditor}
              onToggle={toggleDraft}
              onToggleEditor={(cleanerId) => {
                setPicker(null);
                setArrivalEditor((current) => (current === cleanerId ? null : cleanerId));
              }}
              onArrival={(cleanerId, start, end) => {
                setCleanerArrivals((current) =>
                  current.map((arrival) =>
                    arrival.cleanerId === cleanerId ? { ...arrival, arrivalWindowStart: start, arrivalWindowEnd: end } : arrival,
                  ),
                );
                setMessage(null);
              }}
            />

            {quote && property && estimate ? (
              <div>
                <p className="mb-1.5 text-sm font-medium text-ink/80">Headcount</p>
                <div className="flex min-h-12 items-center justify-between rounded-2xl bg-white px-2 ring-1 ring-ink/15">
                  <button
                    type="button"
                    aria-label="Decrease Headcount"
                    disabled={headcount <= 1}
                    onClick={() => changeHeadcount(headcount - 1)}
                    className="flex size-10 items-center justify-center rounded-full bg-mint text-lg font-semibold disabled:bg-ink/8 disabled:text-ink/25"
                  >
                    −
                  </button>
                  <span className="text-base font-semibold tabular-nums">{headcount}</span>
                  <button
                    type="button"
                    aria-label="Increase Headcount"
                    disabled={headcount >= 12}
                    onClick={() => changeHeadcount(headcount + 1)}
                    className="flex size-10 items-center justify-center rounded-full bg-mint text-lg font-semibold disabled:bg-ink/8 disabled:text-ink/25"
                  >
                    +
                  </button>
                </div>
                <p className="mt-2 text-sm text-ink/70">
                  {property.bedrooms} bed, {property.bathrooms} bath, {property.squareFeet.toLocaleString()} sq ft
                </p>
                <p className="text-sm text-ink/70">
                  Estimated time on site is {estimate.text} with {headcount} {headcount === 1 ? "cleaner" : "cleaners"}.
                </p>
              </div>
            ) : null}

            <Field label="Cleaning duration">
              <select
                className={fieldClass}
                value={duration}
                onChange={(event) => {
                  setDuration(Number(event.target.value));
                  setMessage(null);
                }}
              >
                {(DURATIONS.includes(duration) ? DURATIONS : [duration, ...DURATIONS]).map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes % 60 === 0 ? `${minutes / 60} ${minutes === 60 ? "hour" : "hours"}` : `${minutes} min`}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Special instructions">
              <textarea
                className={`${fieldClass} min-h-24 py-3`}
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
              />
            </Field>

            <PrimaryButton type="submit">Save cleaning</PrimaryButton>
            {trailing}
          </>
        ) : null}
      </form>
      <UnsavedChangesDialog
        open={leaveHref !== null}
        onSave={saveAndLeave}
        onDiscard={() => {
          const href = leaveHref;
          setLeaveHref(null);
          if (href) router.push(href);
        }}
        onDismiss={() => setLeaveHref(null)}
      />
    </>
  );
}

function Cleaners({
  cleaners,
  windows,
  span,
  selected,
  arrivals,
  jobStart,
  jobEnd,
  editorId,
  onToggle,
  onToggleEditor,
  onArrival,
}: {
  cleaners: { cleanerId: string; firstName: string }[];
  windows: { cleanerId: string; start: string; end: string }[];
  span: { start: string; end: string } | null;
  selected: string[];
  arrivals: CleanerArrival[];
  jobStart: string;
  jobEnd: string;
  editorId: string | null;
  onToggle: (cleanerId: string) => void;
  onToggleEditor: (cleanerId: string) => void;
  onArrival: (cleanerId: string, start: string, end: string) => void;
}) {
  const rows = cleaners.flatMap((person) => {
    const pills = availabilityAgainstSpan(
      windows.filter((window) => window.cleanerId === person.cleanerId).map((window) => ({ start: window.start, end: window.end })),
      span,
    );
    if (pills.length === 0) return [];
    const chosen = selected.includes(person.cleanerId);
    const arrival = arrivals.find((item) => item.cleanerId === person.cleanerId);
    return [
      {
        person,
        pills,
        chosen,
        arrivalStart: chosen ? (arrival?.arrivalWindowStart ?? jobStart) : "",
        arrivalEnd: chosen ? (arrival?.arrivalWindowEnd ?? jobEnd) : "",
      },
    ];
  });
  if (rows.length === 0) return null;
  const selectedRows = rows.filter((row) => row.chosen);
  const availableRows = rows.filter((row) => !row.chosen);

  return (
    <div className="space-y-4">
      {selectedRows.length > 0 ? (
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink/80">Selected cleaners</p>
          <div className="space-y-2">
            {selectedRows.map(({ person, pills, arrivalStart, arrivalEnd }) => (
            <div key={person.cleanerId} className="relative overflow-hidden rounded-2xl bg-gold">
              <button
                type="button"
                aria-pressed
                aria-label={`${person.firstName}, selected`}
                onClick={() => onToggle(person.cleanerId)}
                className="absolute inset-0 rounded-2xl"
              />
              <div className="pointer-events-none relative grid grid-cols-[minmax(0,3fr)_1px_minmax(0,1fr)] items-stretch">
                <div className="pointer-events-none min-w-0 px-3 py-2">
                  <p className="text-base font-semibold text-ink">{person.firstName}</p>
                  <div className="mt-1.5">
                    <p className="text-sm text-ink/60">Available</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {pills.map((pill) => (
                        <span
                          key={`${pill.start}-${pill.end}`}
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${pill.fits ? "bg-mint text-ink" : "bg-ink/10 text-ink/55"}`}
                        >
                          {hourWindowLabel(pill.start, pill.end)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="bg-ink/20" />
                <button
                  type="button"
                  aria-expanded={editorId === person.cleanerId}
                  aria-label={`${person.firstName} starts ${hourWindowLabel(arrivalStart, arrivalEnd)}`}
                  onClick={() => onToggleEditor(person.cleanerId)}
                  className="pointer-events-auto relative z-10 flex h-full flex-col items-center justify-center bg-white px-1 py-2 text-center"
                >
                  <span className="text-xs text-ink/60">Starts</span>
                  <span
                    className={`mt-1 max-w-full rounded-full px-1.5 py-0.5 text-xs font-semibold leading-4 ${
                      editorId === person.cleanerId ? "bg-gold text-ink" : "text-ink"
                    }`}
                  >
                    {hourWindowLabel(arrivalStart, arrivalEnd)}
                  </span>
                </button>
              </div>
              {editorId === person.cleanerId ? (
                <div className="pointer-events-auto relative z-10">
                  <CleanerTimeWheel start={arrivalStart} end={arrivalEnd} onChange={(start, end) => onArrival(person.cleanerId, start, end)} />
                </div>
              ) : null}
            </div>
            ))}
          </div>
        </div>
      ) : null}
      {availableRows.length > 0 ? (
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink/80">Available cleaners</p>
          <div className="space-y-2">
            {availableRows.map(({ person, pills }) => (
              <button
                key={person.cleanerId}
                type="button"
                aria-pressed={false}
                onClick={() => onToggle(person.cleanerId)}
                className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl bg-white/60 px-2 py-1 text-left"
              >
                <span className="shrink-0 text-sm font-semibold text-ink/70">{person.firstName}</span>
                <span className="flex min-w-0 flex-wrap gap-1">
                  {pills.map((pill) => (
                    <span
                      key={`${pill.start}-${pill.end}`}
                      className={`rounded-full px-1.5 py-px text-[11px] font-semibold leading-4 ${
                        pill.fits ? "bg-mint text-ink" : "bg-ink/10 text-ink/60"
                      }`}
                    >
                      {hourWindowLabel(pill.start, pill.end)}
                    </span>
                  ))}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CleanerTimeWheel({
  start,
  end,
  onChange,
}: {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
}) {
  const clock = clockParts(start);
  const length = Math.max(minutesFromTime(end) - minutesFromTime(start), 15);
  const minuteChoices = MINUTES.includes(clock.minute) ? MINUTES : [clock.minute, ...MINUTES].sort((a, b) => a - b);

  function choose(patch: Partial<{ hour: number; minute: number; suffix: "AM" | "PM" }>) {
    const parts = { ...clock, ...patch };
    const nextStart = clockTime(parts.hour, parts.minute, parts.suffix);
    const latest = Math.max(0, 24 * 60 - length);
    const startMin = Math.min(Math.max(minutesFromTime(nextStart), 0), latest);
    onChange(timeFromMinutes(startMin), timeFromMinutes(startMin + length));
  }

  return (
    <div className="relative mt-2">
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
          options={minuteChoices.map((minute) => ({ value: String(minute), label: String(minute).padStart(2, "0") }))}
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
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-ink/80">{label}</p>
      {children}
    </div>
  );
}

const WHEEL_ITEM = 36;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTES = Array.from({ length: 12 }, (_, index) => index * 5);

/** Earliest moment at or after the cleaning's start that falls inside one of the cleaner's windows. */
function firstOpenStart(windows: { start: string; end: string }[], jobStart: string): string {
  const from = minutesFromTime(jobStart);
  const open = windows
    .map((window) => ({ start: minutesFromTime(window.start), end: minutesFromTime(window.end) }))
    .filter((window) => window.end > from)
    .map((window) => Math.max(window.start, from));
  return open.length > 0 ? timeFromMinutes(Math.min(...open)) : jobStart;
}

function oneHourWindow(start: string): { start: string; end: string } {
  const parsed = minutesFromTime(start);
  const minutes = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 23 * 60) : 8 * 60;
  return { start: timeFromMinutes(minutes), end: timeFromMinutes(minutes + 60) };
}

function datePillLabel(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day, 12)),
  );
}

function clockParts(time: string): { hour: number; minute: number; suffix: "AM" | "PM" } {
  const total = minutesFromTime(oneHourWindow(time).start);
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
  return timeFromMinutes(Math.min(hour24 * 60 + minute, 23 * 60));
}

function ArrivalStart({
  date,
  start,
  today,
  picker,
  onPicker,
  onDate,
  onStart,
}: {
  date: string;
  start: string;
  today: string;
  picker: "date" | "time" | null;
  onPicker: (picker: "date" | "time" | null) => void;
  onDate: (date: string) => void;
  onStart: (start: string) => void;
}) {
  const clock = clockParts(start);
  const minuteChoices = clock.suffix === "PM" && clock.hour === 11 ? [0] : MINUTES;

  function chooseClock(next: Partial<{ hour: number; minute: number; suffix: "AM" | "PM" }>) {
    const parts = { ...clock, ...next };
    const minute = parts.suffix === "PM" && parts.hour === 11 ? 0 : parts.minute;
    onStart(clockTime(parts.hour, minute, parts.suffix));
  }

  return (
    <div className="rounded-3xl bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-base">Starts</span>
        <span className="flex gap-2">
          <button
            type="button"
            aria-expanded={picker === "date"}
            onClick={() => onPicker(picker === "date" ? null : "date")}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${picker === "date" ? "bg-gold text-ink" : "bg-ink/8 text-ink"}`}
          >
            {datePillLabel(date)}
          </button>
          <button
            type="button"
            aria-expanded={picker === "time"}
            onClick={() => onPicker(picker === "time" ? null : "time")}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${picker === "time" ? "bg-gold text-ink" : "bg-ink/8 text-ink"}`}
          >
            {formatTimeLabel(start)}
          </button>
        </span>
      </div>
      {picker === "date" ? (
        <MonthCalendar
          date={date}
          today={today}
          onDate={onDate}
        />
      ) : null}
      {picker === "time" ? (
        <div className="relative mt-3">
          <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-9 -translate-y-1/2 rounded-lg bg-ink/8" />
          <div className="flex gap-2">
          <TimeWheel
            label="Hour"
            options={HOURS.map((hour) => ({ value: String(hour), label: String(hour) }))}
            value={String(clock.hour)}
            onChange={(value) => chooseClock({ hour: Number(value) })}
          />
          <TimeWheel
            label="Minute"
            options={(minuteChoices.includes(clock.minute) ? minuteChoices : [clock.minute, ...minuteChoices].sort((a, b) => a - b)).map(
              (minute) => ({ value: String(minute), label: String(minute).padStart(2, "0") }),
            )}
            value={String(clock.minute)}
            onChange={(value) => chooseClock({ minute: Number(value) })}
          />
          <TimeWheel
            label="AM or PM"
            options={[
              { value: "AM", label: "AM" },
              { value: "PM", label: "PM" },
            ]}
            value={clock.suffix}
            onChange={(value) => chooseClock({ suffix: value === "PM" ? "PM" : "AM" })}
          />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MonthCalendar({ date, today, onDate }: { date: string; today: string; onDate: (date: string) => void }) {
  const openings = useOpenDates();
  const [month, setMonth] = useState(`${date.slice(0, 7)}-01`);
  const cells = monthCells(month);

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-base font-semibold">{formatMonthYear(month)}</p>
        <span className="flex gap-1">
          <button type="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))} className="flex size-9 items-center justify-center rounded-full bg-ink/8">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button type="button" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))} className="flex size-9 items-center justify-center rounded-full bg-ink/8">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </span>
      </div>
      <div className="mt-2 grid grid-cols-7">
        {WEEKDAYS.map((label) => (
          <p key={label} className="py-1 text-center text-[11px] font-semibold text-ink/40">
            {label}
          </p>
        ))}
        {cells.map((day, index) =>
          day ? (
            <button
              key={day}
              type="button"
              onClick={() => onDate(day)}
              aria-pressed={day === date}
              className="flex min-h-12 flex-col items-center justify-center"
            >
              <span
                className={`flex size-8 items-center justify-center rounded-full text-sm ${
                  day === date ? "bg-ink font-semibold text-cream" : day === today ? "font-semibold text-ink ring-1 ring-mint" : "text-ink"
                }`}
              >
                {Number(day.slice(8))}
              </span>
              {openings.has(day) ? <span className="mt-0.5 size-1.5 rounded-full bg-mint" aria-hidden="true" /> : <span className="mt-0.5 size-1.5" />}
            </button>
          ) : (
            <span key={`empty-${index}`} />
          ),
        )}
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

function useOpenDates() {
  const hub = useHub();
  const activeIds = hub.cleaners
    .filter((cleaner) => cleaner.status === "ACTIVE")
    .map((cleaner) => cleaner.cleanerId)
    .join("\0");
  return useMemo(() => {
    const dates = new Set<string>();
    for (const cleanerId of activeIds ? activeIds.split("\0") : []) {
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
  }, [activeIds, hub.assignments, hub.availability]);
}

function monthCells(monthStart: string): (string | null)[] {
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
  return cells;
}

function shiftMonth(monthStart: string, delta: number): string {
  const shifted = new Date(Date.UTC(Number(monthStart.slice(0, 4)), Number(monthStart.slice(5, 7)) - 1 + delta, 1, 12));
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${month}-01`;
}

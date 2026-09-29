"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useHub } from "@/components/hub-provider";
import { UnsavedChangesDialog, useUnsavedNavigation } from "@/components/unsaved-changes";
import { Field, Notice, PrimaryButton, fieldClass } from "@/components/ui";
import { availabilityAgainstSpan, cleaningTimeSpan } from "@/lib/domain/availability";
import { searchCustomers } from "@/lib/domain/customers";
import type { Property, ServiceType } from "@/lib/domain/types";
import { hourWindowLabel, hourWindows, serviceLabel } from "@/lib/format";
import { calculateQuoteEstimate, type CleanType } from "@/lib/portableQuoteEstimate";

const SERVICES: ServiceType[] = ["DEEP_CLEAN", "RECURRING", "MOVE_OUT", "POST_CONSTRUCTION", "OTHER"];
const DURATIONS = [60, 120, 180, 240, 300, 360, 480];

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
};

function durationAboveEstimate(hoursHigh: number): number {
  const minutes = Math.round((hoursHigh + 1) * 60);
  return DURATIONS.find((option) => option >= minutes) ?? DURATIONS[DURATIONS.length - 1]!;
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
  arrivalWindows,
  leadCleanerId,
  estimateOnLoad = false,
  showDate = false,
  newCustomerHref,
  onSubmit,
  afterDate,
  afterArrival,
  trailing,
}: {
  initial: CleaningValues;
  arrivalWindows: { start: string; end: string }[];
  leadCleanerId: string;
  estimateOnLoad?: boolean;
  showDate?: boolean;
  newCustomerHref: string;
  onSubmit: (values: CleaningValues, nextHref?: string) => { ok: boolean; message?: string };
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
  const [arrivalStart, setArrivalStart] = useState(initial.arrivalWindowStart);
  const [arrivalEnd, setArrivalEnd] = useState(initial.arrivalWindowEnd);
  const [instructions, setInstructions] = useState(initial.specialInstructions);
  const [message, setMessage] = useState<string | null>(null);
  const [headcount, setHeadcount] = useState(initial.headcountNeeded > 0 ? initial.headcountNeeded : 1);
  const [duration, setDuration] = useState(initial.expectedDurationMinutes);
  const [headcountFor, setHeadcountFor] = useState(estimateOnLoad ? "" : "ready");
  const [draftCleanerIds, setDraftCleanerIds] = useState<string[]>(initial.cleanerIds);
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
  const suggestionKey = property && cleanType ? `${property.propertyId}:${cleanType}` : "";
  if (headcountFor !== "ready" && suggestionKey !== headcountFor) {
    setHeadcountFor(suggestionKey);
    if (quote) {
      setHeadcount(quote.time.cleaners);
      setDuration(durationAboveEstimate(quote.time.hoursHigh));
    } else {
      setDuration(240);
    }
  } else if (headcountFor === "ready") {
    setHeadcountFor(suggestionKey);
  }

  const formSnapshot = JSON.stringify({
    date,
    query,
    customerId,
    propertyId,
    serviceType,
    arrivalStart,
    arrivalEnd,
    instructions,
    headcount,
    duration,
    draftCleanerIds: [...draftCleanerIds].sort(),
  });
  const baseline = useRef<string | null>(null);
  const settled = headcountFor === suggestionKey;
  if (baseline.current === null && settled) baseline.current = formSnapshot;
  const dirty = baseline.current !== null && baseline.current !== formSnapshot;
  useUnsavedNavigation(settled, () => dirty, setLeaveHref);

  const windows = arrivalWindows.some((window) => window.start === arrivalStart)
    ? arrivalWindows
    : [{ start: arrivalStart, end: arrivalEnd }, ...arrivalWindows];
  const roster = [
    ...hub.cleaners.filter((item) => item.cleanerId === leadCleanerId),
    ...hub.cleaners.filter((item) => item.status === "ACTIVE" && item.cleanerId !== leadCleanerId),
  ];

  function toggleDraft(id: string) {
    setDraftCleanerIds((current) => {
      if (current.includes(id)) return current.length === 1 ? current : current.filter((item) => item !== id);
      return [...current, id];
    });
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
        {showDate ? (
          <Field label="Date">
            <input
              type="date"
              className={fieldClass}
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setMessage(null);
              }}
            />
          </Field>
        ) : null}
        {afterDate ? afterDate(date) : null}

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

        {customer && homes.length > 1 ? (
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

        <Field label="Arrival window">
          <select
            className={fieldClass}
            value={arrivalStart}
            onChange={(event) => {
              const window = windows.find((item) => item.start === event.target.value);
              if (!window) return;
              setArrivalStart(window.start);
              setArrivalEnd(window.end);
              setMessage(null);
            }}
          >
            {windows.map((window) => (
              <option key={window.start} value={window.start}>
                {hourWindowLabel(window.start, window.end)}
              </option>
            ))}
          </select>
        </Field>
        {afterArrival ? afterArrival(arrivalStart, arrivalEnd) : null}

        <CleanerRoster
          cleaners={roster}
          windows={hub.availability.filter((window) => window.date === date)}
          span={cleaningTimeSpan(arrivalStart, arrivalEnd, duration)}
          selected={draftCleanerIds}
          onToggle={toggleDraft}
        />

        {quote && property ? (
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink/80">Headcount</p>
            <div className="flex min-h-12 items-center justify-between rounded-2xl bg-white px-2 ring-1 ring-ink/15">
              <button
                type="button"
                aria-label="Decrease Headcount"
                disabled={headcount <= 1}
                onClick={() => setHeadcount(headcount - 1)}
                className="flex size-10 items-center justify-center rounded-full bg-mint text-lg font-semibold disabled:bg-ink/8 disabled:text-ink/25"
              >
                −
              </button>
              <span className="text-base font-semibold tabular-nums">{headcount}</span>
              <button
                type="button"
                aria-label="Increase Headcount"
                disabled={headcount >= 12}
                onClick={() => setHeadcount(headcount + 1)}
                className="flex size-10 items-center justify-center rounded-full bg-mint text-lg font-semibold disabled:bg-ink/8 disabled:text-ink/25"
              >
                +
              </button>
            </div>
            <p className="mt-2 text-sm text-ink/70">
              {property.bedrooms} bed, {property.bathrooms} bath, {property.squareFeet.toLocaleString()} sq ft
            </p>
            <p className="text-sm text-ink/70">
              Estimated time on site is {quote.time.displayText} with {quote.time.cleaners}{" "}
              {quote.time.cleaners === 1 ? "cleaner" : "cleaners"}.
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

function CleanerRoster({
  cleaners,
  windows,
  span,
  selected,
  onToggle,
}: {
  cleaners: { cleanerId: string; firstName: string }[];
  windows: { cleanerId: string; start: string; end: string }[];
  span: { start: string; end: string } | null;
  selected: string[];
  onToggle: (cleanerId: string) => void;
}) {
  const rows = cleaners.flatMap((person) => {
    const pills = availabilityAgainstSpan(
      windows.filter((window) => window.cleanerId === person.cleanerId).map((window) => ({ start: window.start, end: window.end })),
      span,
    );
    return pills.length > 0 ? [{ person, pills }] : [];
  });
  if (rows.length === 0) return null;

  return (
    <div>
      <p className="mb-1 text-sm font-medium text-ink/80">Cleaners</p>
      <div className="space-y-1">
        {rows.map(({ person, pills }) => {
          const chosen = selected.includes(person.cleanerId);
          return (
            <button
              key={person.cleanerId}
              type="button"
              aria-pressed={chosen}
              onClick={() => onToggle(person.cleanerId)}
              className={`flex min-h-8 w-full items-center gap-2 rounded-xl px-2 py-1 text-left ${
                chosen ? "bg-white ring-1 ring-gold" : "bg-white/60"
              }`}
            >
              <span className={`shrink-0 text-sm font-semibold ${chosen ? "text-ink" : "text-ink/70"}`}>{person.firstName}</span>
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
          );
        })}
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

export function dayArrivalWindows(saved?: { start: string; end: string }) {
  const choices = hourWindows("08:00", "18:00");
  if (saved && !choices.some((window) => window.start === saved.start)) return [saved, ...choices];
  return choices;
}

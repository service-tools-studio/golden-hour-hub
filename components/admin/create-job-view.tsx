"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useHub } from "@/components/hub-provider";
import { UnsavedChangesDialog, useUnsavedNavigation } from "@/components/unsaved-changes";
import { Field, Notice, PageHeader, PrimaryButton, Screen, fieldClass } from "@/components/ui";
import { availabilityAgainstSpan, cleaningTimeSpan } from "@/lib/domain/availability";
import { searchCustomers } from "@/lib/domain/customers";
import type { Property, ServiceType } from "@/lib/domain/types";
import { isValidDate, isValidLocalTime, minutesFromTime } from "@/lib/domain/time";
import { formatLongDate, hourWindowLabel, hourWindows, serviceLabel } from "@/lib/format";
import { calculateQuoteEstimate, type CleanType } from "@/lib/portableQuoteEstimate";

const SERVICES: ServiceType[] = ["DEEP_CLEAN", "RECURRING", "MOVE_OUT", "POST_CONSTRUCTION", "OTHER"];
const DURATIONS = [60, 120, 180, 240, 300, 360, 480];

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

export function CreateJobView({
  cleanerId,
  date,
  start,
  end,
  customerId: initialCustomerId = "",
}: {
  cleanerId: string;
  date: string;
  start: string;
  end: string;
  customerId?: string;
}) {
  const hub = useHub();
  const router = useRouter();
  const cleaner = hub.cleaners.find((item) => item.cleanerId === cleanerId && item.status === "ACTIVE");
  const ready = Boolean(cleaner && isValidDate(date) && isValidLocalTime(start) && isValidLocalTime(end) && minutesFromTime(end) > minutesFromTime(start));
  const knownCustomer = hub.customers.some((item) => item.customerId === initialCustomerId);
  const [query, setQuery] = useState("");
  const [customerId, setCustomerId] = useState(knownCustomer ? initialCustomerId : "");
  const [propertyId, setPropertyId] = useState(
    knownCustomer
      ? (hub.properties.find((item) => item.customerId === initialCustomerId && item.status === "ACTIVE")?.propertyId ?? "")
      : "",
  );
  const [serviceType, setServiceType] = useState<ServiceType>("DEEP_CLEAN");
  const arrivalWindows = hourWindows(start, end);
  const [arrivalStart, setArrivalStart] = useState(arrivalWindows[0]?.start ?? start);
  const [arrivalEnd, setArrivalEnd] = useState(arrivalWindows[0]?.end ?? end);
  const [instructions, setInstructions] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [headcount, setHeadcount] = useState(1);
  const [duration, setDuration] = useState(240);
  const [headcountFor, setHeadcountFor] = useState("");
  const [draftCleanerIds, setDraftCleanerIds] = useState<string[]>([cleanerId]);

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
  if (suggestionKey !== headcountFor) {
    setHeadcountFor(suggestionKey);
    if (quote) {
      setHeadcount(quote.time.cleaners);
      setDuration(durationAboveEstimate(quote.time.hoursHigh));
    } else {
      setDuration(240);
    }
  }

  const formSnapshot = JSON.stringify({
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
  if (baseline.current === null && headcountFor === suggestionKey) baseline.current = formSnapshot;
  const dirty = baseline.current !== null && baseline.current !== formSnapshot;
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  useUnsavedNavigation(ready, () => dirty, setLeaveHref);

  function toggleDraft(id: string) {
    setDraftCleanerIds((current) => {
      if (current.includes(id)) return current.length === 1 ? current : current.filter((item) => item !== id);
      return [...current, id];
    });
  }

  function chooseCustomer(nextId: string) {
    const nextHomes = hub.properties.filter((item) => item.customerId === nextId && item.status === "ACTIVE");
    setCustomerId(nextId);
    setPropertyId(nextHomes[0]?.propertyId ?? "");
    setQuery("");
    setMessage(null);
  }

  function submit(nextHref?: string) {
    if (!cleaner) return false;
    const result = hub.createJob({
      date,
      customerId,
      propertyId,
      serviceType,
      arrivalWindowStart: arrivalStart,
      arrivalWindowEnd: arrivalEnd,
      headcountNeeded: quote ? headcount : 0,
      expectedDurationMinutes: duration,
      cleanerIds: draftCleanerIds,
      specialInstructions: instructions,
    });
    if (!result.ok || !result.jobId) {
      setMessage(result.ok ? "The cleaning could not be created." : result.message);
      return false;
    }
    if (result.message) hub.flash(result.message);
    router.push(nextHref ?? `/admin/jobs/${result.jobId}`);
    return true;
  }

  function saveAndLeave() {
    const href = leaveHref ?? undefined;
    if (!submit(href)) setLeaveHref(null);
  }

  if (!ready || !cleaner) {
    return (
      <Screen>
        <PageHeader title="New cleaning" crumb={{ href: "/admin/schedule", label: "Schedule" }} />
        <div className="px-5 pt-4">
          <Notice>That availability window could not be opened.</Notice>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader
        title="New cleaning"
        subtitle={formatLongDate(date)}
        crumb={{ href: `/admin/schedule?date=${date}`, label: "Schedule" }}
      />
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
                {homes.find((home) => home.propertyId === propertyId) ? (
                  <span className="block text-sm text-ink/70">{propertyLine(homes.find((home) => home.propertyId === propertyId)!)}</span>
                ) : null}
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
            <Link
              href={`/admin/customers/new?returnTo=${encodeURIComponent(`/admin/jobs/new?cleanerId=${cleanerId}&date=${date}&start=${start}&end=${end}`)}`}
              className="block rounded-3xl bg-white p-4 shadow-[0_8px_30px_rgba(51,51,51,0.06)]"
            >
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
                  onClick={() => setPropertyId(home.propertyId)}
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
                onClick={() => setServiceType(item)}
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
              const window = arrivalWindows.find((item) => item.start === event.target.value);
              if (!window) return;
              setArrivalStart(window.start);
              setArrivalEnd(window.end);
              setMessage(null);
            }}
          >
            {arrivalWindows.map((window) => (
              <option key={window.start} value={window.start}>
                {hourWindowLabel(window.start, window.end)}
              </option>
            ))}
          </select>
        </Field>

        <CleanerRoster
          cleaners={[
            ...hub.cleaners.filter((item) => item.cleanerId === cleaner.cleanerId),
            ...hub.cleaners.filter((item) => item.status === "ACTIVE" && item.cleanerId !== cleaner.cleanerId),
          ]}
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
            {DURATIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes === 60 ? "1 hour" : `${minutes / 60} hours`}
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
    </Screen>
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

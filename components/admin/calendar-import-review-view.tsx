"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrivalWindowPicker } from "@/components/admin/arrival-window-picker";
import { CustomerCombobox } from "@/components/admin/customer-combobox";
import { EstimatedDurationPicker } from "@/components/admin/estimated-duration-picker";
import { HeadcountStepper } from "@/components/admin/headcount-stepper";
import { useHub } from "@/components/hub-provider";
import { Field, FormSubmitNotice, PageHeader, PrimaryButton, Screen, SecondaryButton, fieldClass } from "@/components/ui";
import {
  calendarImportDefaultServiceType,
  calendarImportDetailText,
  calendarImportRawEventDetailsText,
  resolvedCalendarImportSpecialInstructions,
  calendarImportNewCustomerHref,
  calendarEventTitleHasTbd,
  formatCalendarImportAddress,
  mergeCalendarImportCustomerHints,
  normalizeCalendarEventTitle,
  resolveCalendarImportMatchedJobId,
} from "@/lib/domain/calendar-import";
import { appleCalendarDayUrl } from "@/lib/calendar";
import { formatCentsToDollarsInput, parseDollarsToCents } from "@/lib/domain/compensation";
import { searchCustomers } from "@/lib/domain/customers";
import type { Property, ServiceType } from "@/lib/domain/types";
import { formatLongDate, serviceLabel } from "@/lib/format";

const SERVICES: ServiceType[] = ["DEEP_CLEAN", "RECURRING", "MOVE_OUT", "POST_CONSTRUCTION", "OTHER"];

function propertyLine(home: Property): string {
  return home.label ? `${home.label} · ${home.streetAddress}` : `${home.streetAddress}, ${home.city}`;
}

function customerEditHref(customerId: string, returnTo: string): string {
  const params = new URLSearchParams({ edit: "1", returnTo });
  return `/admin/customers/${customerId}?${params}`;
}

function CustomerEditIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function ChangeCustomerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M7 7l10 10M17 7L7 17" />
    </svg>
  );
}

export function CalendarImportReviewView({ importId }: { importId: string }) {
  const hub = useHub();
  const router = useRouter();
  const searchParams = useSearchParams();
  const row = hub.calendarImports.find((item) => item.importId === importId);
  const [customerId, setCustomerId] = useState(row?.suggestedCustomerId ?? "");
  const [propertyId, setPropertyId] = useState(row?.suggestedPropertyId ?? "");
  const [serviceDate, setServiceDate] = useState(row?.serviceDate ?? hub.today);
  const [arrivalStart, setArrivalStart] = useState(row?.arrivalWindowStart ?? "");
  const [arrivalEnd, setArrivalEnd] = useState(row?.arrivalWindowEnd ?? "");
  const [arrivalStartTbd, setArrivalStartTbd] = useState(() => {
    if (!row) return true;
    if (calendarEventTitleHasTbd(row.raw.title)) return true;
    return !row.arrivalWindowStart;
  });
  const [duration, setDuration] = useState<number | null>(() => row?.expectedDurationMinutes ?? null);
  const [serviceType, setServiceType] = useState<ServiceType>(() =>
    row
      ? calendarImportDefaultServiceType(row.serviceType, row.suggestedCustomerId, hub.customers)
      : "DEEP_CLEAN",
  );
  const [headcount, setHeadcount] = useState(row && row.headcountNeeded > 0 ? row.headcountNeeded : 1);
  const resolvedInstructions = row ? resolvedCalendarImportSpecialInstructions(row) : "";
  const [instructions, setInstructions] = useState("");
  const [pricePerVisit, setPricePerVisit] = useState(() =>
    row?.pricePerVisitCents !== undefined ? formatCentsToDollarsInput(row.pricePerVisitCents) : "",
  );
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!row) return;
    setInstructions(resolvedCalendarImportSpecialInstructions(row));
  }, [row?.importId]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<"approve" | "draft" | "dismiss" | null>(null);
  const [refreshingDetails, setRefreshingDetails] = useState(false);
  const busy = pending !== null;

  const customer = hub.customers.find((item) => item.customerId === customerId);
  const properties = useMemo(
    () => hub.properties.filter((item) => item.customerId === customerId && item.status === "ACTIVE"),
    [hub.properties, customerId],
  );
  const property = properties.find((item) => item.propertyId === propertyId);
  const customerMatches = useMemo(
    () => searchCustomers(hub.customers, hub.properties, query),
    [hub.customers, hub.properties, query],
  );
  const customerEditReturnTo = `/admin/calendar-imports/${importId}`;

  useEffect(() => {
    const returnedCustomerId = searchParams.get("customerId")?.trim();
    if (!returnedCustomerId) return;
    const match = hub.customers.find((item) => item.customerId === returnedCustomerId && item.status === "ACTIVE");
    if (!match) return;
    setCustomerId(match.customerId);
    const firstProperty = hub.properties.find(
      (property) => property.customerId === match.customerId && property.status === "ACTIVE",
    );
    setPropertyId(firstProperty?.propertyId ?? "");
    setQuery("");
    setServiceType((current) => calendarImportDefaultServiceType(current, match.customerId, hub.customers));
    router.replace(`/admin/calendar-imports/${importId}`, { scroll: false });
  }, [searchParams, hub.customers, hub.properties, importId, router]);

  if (!row || row.status !== "PENDING_REVIEW") {
    return (
      <Screen>
        <PageHeader title="Calendar import" crumb={{ href: "/admin", label: "Dashboard" }} />
        <div className="px-5 pt-4 text-base text-ink/70">
          {row?.status === "APPROVED" && row.approvedJobId ? (
            <Link href={`/admin/jobs/${row.approvedJobId}?from=dashboard`} className="font-semibold underline">
              This import was already approved.
            </Link>
          ) : (
            "That import is not available for review."
          )}
        </div>
      </Screen>
    );
  }

  const active = row;
  const matchedJobId = resolveCalendarImportMatchedJobId(hub.jobs, hub.customers, hub.properties, active);
  const matchedJob = matchedJobId ? hub.jobs.find((job) => job.jobId === matchedJobId) : undefined;
  const suggestedName = [active.parsed.suggestedFirstName, active.parsed.suggestedLastName].filter(Boolean).join(" ");
  const mergedHints = mergeCalendarImportCustomerHints(
    active.parsed,
    calendarImportDetailText(active.raw, ""),
  );
  const sizeSummary = [
    mergedHints.bedrooms !== undefined ? `${mergedHints.bedrooms} bed` : null,
    mergedHints.bathrooms !== undefined ? `${mergedHints.bathrooms} bath` : null,
    mergedHints.squareFeet !== undefined ? `${mergedHints.squareFeet.toLocaleString()} sq ft` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const addressLine =
    formatCalendarImportAddress(mergedHints) ||
    (active.raw.location?.trim() ? active.raw.location.trim() : undefined);
  const rawEventDetails = calendarImportRawEventDetailsText(active.raw);
  const iphoneCalendarDayHref = appleCalendarDayUrl({
    date: serviceDate,
    time: arrivalStartTbd ? undefined : arrivalStart || undefined,
  });

  function chooseCustomer(nextId: string) {
    const nextHomes = hub.properties.filter((item) => item.customerId === nextId && item.status === "ACTIVE");
    setCustomerId(nextId);
    setPropertyId(nextHomes[0]?.propertyId ?? "");
    setQuery("");
    setServiceType((current) => calendarImportDefaultServiceType(current, nextId, hub.customers));
    setMessage(null);
  }

  function clearCustomer() {
    setCustomerId("");
    setPropertyId("");
    setQuery("");
    setMessage(null);
  }

  function pricePerVisitCentsFromInput(): number | undefined | null {
    const trimmed = pricePerVisit.trim();
    if (!trimmed) return undefined;
    return parseDollarsToCents(trimmed);
  }

  function draftInput(pricePerVisitCents: number | undefined) {
    const arrival = arrivalStartTbd
      ? { arrivalWindowStart: undefined, arrivalWindowEnd: undefined }
      : { arrivalWindowStart: arrivalStart, arrivalWindowEnd: arrivalEnd };
    return {
      importId: active.importId,
      serviceDate,
      ...arrival,
      expectedDurationMinutes: duration ?? undefined,
      serviceType,
      headcountNeeded: headcount,
      specialInstructions: instructions.trim() || resolvedInstructions,
      pricePerVisitCents,
      suggestedCustomerId: customerId || undefined,
      suggestedPropertyId: propertyId || undefined,
    };
  }

  async function refreshEventDetails() {
    setRefreshingDetails(true);
    try {
      const result = await hub.syncCalendarImports();
      if (result.message) hub.flash(result.message);
    } finally {
      setRefreshingDetails(false);
    }
  }

  async function saveDraft() {
    setPending("draft");
    setMessage(null);
    const parsedPrice = pricePerVisitCentsFromInput();
    if (parsedPrice === null) {
      setMessage("Enter a valid price per visit.");
      setPending(null);
      return;
    }
    const result = await hub.updateCalendarImport(draftInput(parsedPrice));
    setPending(null);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    hub.flash("Draft saved.");
  }

  async function dismiss() {
    setPending("dismiss");
    const result = await hub.rejectCalendarImport(active.importId);
    setPending(null);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    hub.flash(result.message ?? "Import dismissed.");
    router.push("/admin");
  }

  async function approve() {
    if (matchedJobId) {
      setMessage("A cleaning is already scheduled for this date.");
      return;
    }
    if (!customerId || !propertyId) {
      setMessage("Choose a customer and property before approving.");
      return;
    }
    const parsedPrice = pricePerVisitCentsFromInput();
    if (parsedPrice === null) {
      setMessage("Enter a valid price per visit.");
      return;
    }
    setPending("approve");
    setMessage(null);
    const result = await hub.approveCalendarImport({
      ...draftInput(parsedPrice),
      customerId,
      propertyId,
    });
    setPending(null);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    hub.flash(result.message ?? "Cleaning added to the schedule.");
    router.push(result.jobId ? `/admin/jobs/${result.jobId}?from=dashboard` : "/admin");
  }

  return (
    <Screen>
      <PageHeader
        title="Review calendar import"
        subtitle={formatLongDate(serviceDate)}
        crumb={{ href: "/admin", label: "Dashboard" }}
      />
      <form
        className="space-y-4 px-5 pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          void approve();
        }}
      >
        {matchedJob ? (
          <div className="rounded-2xl bg-mint/40 px-4 py-3 ring-1 ring-ink/15">
            <p className="text-sm font-semibold text-ink">Cleaning already on the schedule</p>
            <p className="mt-1 text-sm text-ink/75">
              This calendar event matches an existing visit
              {matchedJob.seriesId ? " from a recurring schedule" : ""}. You can open it or dismiss this import.
            </p>
            <Link
              href={`/admin/jobs/${matchedJob.jobId}?from=dashboard`}
              className="mt-2 inline-block text-sm font-semibold underline"
            >
              View scheduled cleaning
            </Link>
          </div>
        ) : null}

        <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-ink/10">
          <p className="text-lg font-semibold">
            {normalizeCalendarEventTitle(active.raw.title) || "Untitled event"}
          </p>
          {suggestedName ? <p className="text-sm text-ink/70">Suggested name: {suggestedName}</p> : null}
          {addressLine ? <p className="mt-1 text-sm text-ink/80">{addressLine}</p> : null}
          {sizeSummary ? (
            <p className="mt-1 text-sm font-medium text-ink/70">From event details: {sizeSummary}</p>
          ) : active.raw.description.trim() ? (
            <p className="mt-1 text-sm text-ink/50">No bed/bath/sq ft found in event details.</p>
          ) : (
            <div className="mt-1 space-y-2">
              <p className="text-sm text-amber-800">No event details synced yet</p>
              <SecondaryButton
                type="button"
                loading={refreshingDetails}
                loadingLabel="Refreshing…"
                disabled={busy || refreshingDetails}
                onClick={() => void refreshEventDetails()}
              >
                Refresh
              </SecondaryButton>
            </div>
          )}
          {iphoneCalendarDayHref ? (
            <a href={iphoneCalendarDayHref} className="mt-2 inline-block text-sm font-semibold underline">
              Open in iPhone Calendar
            </a>
          ) : null}
        </div>

        {customer ? (
          <Field label="Customer">
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-3 ring-1 ring-ink/15">
              <span>
                <span className="block font-semibold">
                  {customer.firstName} {customer.lastName}
                </span>
                {property ? <span className="block text-sm text-ink/70">{propertyLine(property)}</span> : null}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <Link
                  href={customerEditHref(customer.customerId, customerEditReturnTo)}
                  className="flex size-11 items-center justify-center rounded-full text-ink/70 hover:bg-cream"
                  aria-label={`Edit ${customer.firstName} ${customer.lastName}`}
                >
                  <CustomerEditIcon />
                </Link>
                <button
                  type="button"
                  className="flex size-11 items-center justify-center rounded-full text-ink/70 hover:bg-cream"
                  aria-label="Choose a different customer"
                  onClick={clearCustomer}
                >
                  <ChangeCustomerIcon />
                </button>
              </div>
            </div>
          </Field>
        ) : (
          <>
            <CustomerCombobox
              query={query}
              onQueryChange={setQuery}
              matches={customerMatches}
              propertyLine={propertyLine}
              newCustomerHref={calendarImportNewCustomerHref(active)}
              onChoose={chooseCustomer}
            />
            {mergedHints.suggestedPhone || mergedHints.suggestedEmail ? (
              <p className="-mt-2 text-sm text-ink/50">
                {mergedHints.suggestedPhone ? (
                  <span className="block">Phone from event: {mergedHints.suggestedPhone}</span>
                ) : null}
                {mergedHints.suggestedEmail ? (
                  <span className="block">Email from event: {mergedHints.suggestedEmail}</span>
                ) : null}
              </p>
            ) : null}
          </>
        )}

        {customerId ? (
          <Field label="Property">
            <select
              className={fieldClass}
              value={propertyId}
              onChange={(event) => setPropertyId(event.target.value)}
            >
              <option value="">Choose a property</option>
              {properties.map((property) => (
                <option key={property.propertyId} value={property.propertyId}>
                  {property.streetAddress}, {property.city}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <Field label="Cleaning date">
          <input
            type="date"
            className={fieldClass}
            value={serviceDate}
            onChange={(event) => setServiceDate(event.target.value)}
          />
        </Field>

        <Field label="Start time">
          <ArrivalWindowPicker
            start={arrivalStart}
            end={arrivalEnd}
            startTbd={arrivalStartTbd}
            onChange={(nextStart, nextEnd) => {
              setArrivalStart(nextStart);
              setArrivalEnd(nextEnd);
            }}
            onStartTbdChange={setArrivalStartTbd}
          />
        </Field>

        <EstimatedDurationPicker value={duration} onChange={setDuration} />

        <Field label="Service type">
          <div className="flex flex-wrap gap-2">
            {SERVICES.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={serviceType === item}
                onClick={() => setServiceType(item)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                  serviceType === item ? "bg-gold text-ink" : "bg-white text-ink/70 ring-1 ring-ink/15"
                }`}
              >
                {serviceLabel(item)}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Headcount needed">
          <HeadcountStepper
            value={headcount}
            min={1}
            max={12}
            ariaLabel="Headcount needed"
            onChange={setHeadcount}
          />
        </Field>

        <Field label="Price per visit (optional)" hint="Admin only. Cleaners never see this.">
          <input
            type="text"
            inputMode="decimal"
            className={fieldClass}
            placeholder="e.g. 185"
            value={pricePerVisit}
            onChange={(event) => {
              setPricePerVisit(event.target.value);
              setMessage(null);
            }}
          />
        </Field>

        <Field
          label="Special instructions"
          hint="Visible to cleaners"
        >
          <textarea
            className={`${fieldClass} min-h-24`}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
          />
          {rawEventDetails ? (
            <div className="mt-3 rounded-2xl bg-ink/[0.03] px-3 py-3 ring-1 ring-ink/10">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/45">Raw event details</p>
              <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-ink/75">
                {rawEventDetails}
              </pre>
            </div>
          ) : null}
        </Field>

        <FormSubmitNotice message={message} />

        <div className="space-y-2">
          <PrimaryButton
            type="submit"
            disabled={busy || Boolean(matchedJobId)}
            loading={pending === "approve"}
            loadingLabel="Approving…"
          >
            Approve and add to schedule
          </PrimaryButton>
          <SecondaryButton
            type="button"
            disabled={busy}
            loading={pending === "draft"}
            loadingLabel="Saving…"
            onClick={() => void saveDraft()}
          >
            Save draft
          </SecondaryButton>
          <SecondaryButton
            type="button"
            disabled={busy}
            loading={pending === "dismiss"}
            loadingLabel="Dismissing…"
            onClick={() => void dismiss()}
          >
            Dismiss import
          </SecondaryButton>
        </div>
      </form>
    </Screen>
  );
}
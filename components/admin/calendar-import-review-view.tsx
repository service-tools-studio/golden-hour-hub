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
  resolveCalendarImportCustomerLink,
} from "@/lib/domain/calendar-import";
import { appleCalendarDayUrl } from "@/lib/calendar";
import { formatCentsToDollarsInput, parseDollarsToCents } from "@/lib/domain/compensation";
import { searchCustomers } from "@/lib/domain/customers";
import type { Property, ServiceType } from "@/lib/domain/types";
import {
  ESTIMATED_ON_SITE_FIELD_HINT,
  ESTIMATED_ON_SITE_FIELD_LABEL,
  formatLongDate,
  propertySizeLabel,
  serviceLabel,
} from "@/lib/format";
import {
  calculateQuoteEstimate,
  type CleanType,
  type QuoteEstimate,
} from "@/lib/portableQuoteEstimate";

const SERVICES: ServiceType[] = ["DEEP_CLEAN", "RECURRING", "MOVE_OUT", "POST_CONSTRUCTION", "OTHER"];

function cleanTypeFor(service: ServiceType): CleanType | null {
  if (service === "DEEP_CLEAN") return "deep";
  if (service === "RECURRING") return "standard";
  if (service === "MOVE_OUT") return "move_out";
  return null;
}

function trimHours(hours: number): string {
  return String(Number(hours.toFixed(2)));
}

function onSiteHours(quote: QuoteEstimate, headcount: number): { text: string } {
  const spread = (hours: number) => Math.round(((hours * quote.time.cleaners) / headcount) * 4) / 4;
  const low = spread(quote.time.hoursLow);
  const high = spread(quote.time.hoursHigh);
  const unit = high === 1 ? "hour" : "hours";
  return {
    text: low === high ? `~${trimHours(high)} ${unit}` : `${trimHours(low)}–${trimHours(high)} ${unit}`,
  };
}

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
  const [customerId, setCustomerId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [customerManual, setCustomerManual] = useState(false);
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
      ? calendarImportDefaultServiceType(row.serviceType, row.suggestedCustomerId, hub.customers, hub.jobs)
      : "DEEP_CLEAN",
  );
  const [headcount, setHeadcount] = useState(row && row.headcountNeeded > 0 ? row.headcountNeeded : 1);
  const resolvedInstructions = row ? resolvedCalendarImportSpecialInstructions(row) : "";
  const [instructions, setInstructions] = useState("");
  const [pricePerVisit, setPricePerVisit] = useState(() =>
    row?.pricePerVisitCents !== undefined ? formatCentsToDollarsInput(row.pricePerVisitCents) : "",
  );
  const [query, setQuery] = useState("");
  const [customerCleared, setCustomerCleared] = useState(false);
  const [importLoadFailed, setImportLoadFailed] = useState(false);

  useEffect(() => {
    if (row || !hub.ready || importLoadFailed) return;
    let cancelled = false;
    void hub.ensureHubCalendarImport(importId).then((loaded) => {
      if (!cancelled && !loaded) setImportLoadFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [hub, hub.ready, row, importId, importLoadFailed, hub.ensureHubCalendarImport]);

  useEffect(() => {
    if (!row) return;
    setInstructions(resolvedCalendarImportSpecialInstructions(row));
  }, [row?.importId]);

  useEffect(() => {
    setCustomerCleared(false);
    setCustomerManual(false);
  }, [importId]);

  useEffect(() => {
    const current = hub.calendarImports.find((item) => item.importId === importId);
    if (!current) return;
    if (customerCleared || customerManual) return;
    const link = resolveCalendarImportCustomerLink(hub.customers, hub.properties, current);
    const nextCustomerId = link.customerId ?? "";
    setCustomerId(nextCustomerId);
    setPropertyId(link.propertyId ?? "");
    setServiceType(
      calendarImportDefaultServiceType(current.serviceType, nextCustomerId || undefined, hub.customers, hub.jobs),
    );
  }, [
    importId,
    row?.importId,
    row?.parsed,
    row?.raw,
    row?.specialInstructions,
    row?.serviceType,
    row?.updatedAt,
    hub.customers,
    hub.properties,
    hub.jobs,
    customerCleared,
    customerManual,
  ]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<"approve" | "dismiss" | null>(null);
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
    setCustomerManual(true);
    setCustomerId(match.customerId);
    const firstProperty = hub.properties.find(
      (property) => property.customerId === match.customerId && property.status === "ACTIVE",
    );
    setPropertyId(firstProperty?.propertyId ?? "");
    setQuery("");
    const currentRow = hub.calendarImports.find((item) => item.importId === importId);
    if (currentRow) {
      setServiceType(
        calendarImportDefaultServiceType(currentRow.serviceType, match.customerId, hub.customers, hub.jobs),
      );
    }
    router.replace(`/admin/calendar-imports/${importId}`, { scroll: false });
  }, [searchParams, hub.customers, hub.properties, importId, router]);

  if (!row) {
    if (importLoadFailed) {
      return (
        <Screen>
          <PageHeader title="Calendar import" crumb={{ href: "/admin", label: "Dashboard" }} />
          <div className="px-5 pt-4 text-base text-ink/70">That import is not available for review.</div>
        </Screen>
      );
    }
    return (
      <Screen>
        <PageHeader title="Calendar import" crumb={{ href: "/admin", label: "Dashboard" }} />
        <p className="px-5 pt-8 text-sm text-ink/55">Loading import…</p>
      </Screen>
    );
  }

  if (row.status !== "PENDING_REVIEW") {
    return (
      <Screen>
        <PageHeader title="Calendar import" crumb={{ href: "/admin", label: "Dashboard" }} />
        <div className="px-5 pt-4 text-base text-ink/70">
          {row.status === "APPROVED" && row.approvedJobId ? (
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
  const linkedCustomerId = customerCleared ? "" : customerId.trim();
  const linkedCustomer = linkedCustomerId
    ? hub.customers.find((item) => item.customerId === linkedCustomerId)
    : undefined;
  const linkedPropertyId = propertyId.trim();
  const linkedProperties = hub.properties.filter(
    (item) => item.customerId === linkedCustomerId && item.status === "ACTIVE",
  );
  const linkedProperty =
    linkedProperties.find((item) => item.propertyId === (propertyId || linkedPropertyId)) ?? linkedProperties[0];
  const displayServiceType = calendarImportDefaultServiceType(
    active.serviceType,
    linkedCustomerId || undefined,
    hub.customers,
    hub.jobs,
  );
  const autoLink = resolveCalendarImportCustomerLink(hub.customers, hub.properties, active);
  const customerChanged = Boolean(customerId.trim()) && customerId.trim() !== (autoLink.customerId ?? "");
  const shownServiceType = customerChanged ? serviceType : displayServiceType;
  const matchedJobId = resolveCalendarImportMatchedJobId(hub.jobs, hub.customers, hub.properties, active, autoLink);
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
  const cleanTypeForEstimate = cleanTypeFor(shownServiceType);
  const estimateProperty = property ?? linkedProperty;
  const estimateSizeSource = estimateProperty
    ? {
        bedrooms: estimateProperty.bedrooms,
        bathrooms: estimateProperty.bathrooms,
        sqft: estimateProperty.squareFeet,
      }
    : mergedHints.bedrooms !== undefined && mergedHints.bathrooms !== undefined
      ? {
          bedrooms: mergedHints.bedrooms,
          bathrooms: mergedHints.bathrooms,
          sqft: mergedHints.squareFeet,
        }
      : null;
  const cleaningQuote =
    estimateSizeSource && cleanTypeForEstimate
      ? { quote: calculateQuoteEstimate({ ...estimateSizeSource, cleanType: cleanTypeForEstimate }), size: estimateSizeSource }
      : null;
  const headcountEstimate = cleaningQuote ? onSiteHours(cleaningQuote.quote, headcount) : null;
  const estimateSizeLine = cleaningQuote
    ? propertySizeLabel(cleaningQuote.size.bedrooms, cleaningQuote.size.bathrooms, cleaningQuote.size.sqft ?? 0)
    : null;
  const iphoneCalendarDayHref = appleCalendarDayUrl({
    date: serviceDate,
    time: arrivalStartTbd ? undefined : arrivalStart || undefined,
  });

  function chooseCustomer(nextId: string) {
    const nextHomes = hub.properties.filter((item) => item.customerId === nextId && item.status === "ACTIVE");
    setCustomerCleared(false);
    setCustomerManual(true);
    setCustomerId(nextId);
    setPropertyId(nextHomes[0]?.propertyId ?? "");
    setQuery("");
    setServiceType(calendarImportDefaultServiceType(active.serviceType, nextId, hub.customers, hub.jobs));
    setMessage(null);
  }

  function clearCustomer() {
    setCustomerCleared(true);
    setCustomerId("");
    setPropertyId("");
    setQuery("");
    setServiceType(calendarImportDefaultServiceType(active.serviceType, undefined, hub.customers, hub.jobs));
    setMessage(null);
  }

  function pricePerVisitCentsFromInput(): number | undefined | null {
    const trimmed = pricePerVisit.trim();
    if (!trimmed) return undefined;
    return parseDollarsToCents(trimmed);
  }

  function approveInput(pricePerVisitCents: number | undefined) {
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
      ...approveInput(parsedPrice),
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
        data-testid="calendar-import-review-form"
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

        {linkedCustomer && !customerCleared ? (
          <Field label="Customer">
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-3 ring-1 ring-ink/15">
              <span>
                <span className="block font-semibold">
                  {linkedCustomer.firstName} {linkedCustomer.lastName}
                </span>
                {linkedProperty ? (
                  <span className="block text-sm text-ink/70">{propertyLine(linkedProperty)}</span>
                ) : null}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <Link
                  href={customerEditHref(linkedCustomer.customerId, customerEditReturnTo)}
                  className="flex size-11 items-center justify-center rounded-full text-ink/70 hover:bg-cream"
                  aria-label={`Edit ${linkedCustomer.firstName} ${linkedCustomer.lastName}`}
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
            <p className="text-sm text-ink/60">
              <Link href={calendarImportNewCustomerHref(active)} className="font-semibold underline">
                Create a new customer
              </Link>
            </p>
            {formatCalendarImportAddress(mergedHints) ||
            mergedHints.suggestedPhone ||
            mergedHints.suggestedEmail ? (
              <p className="-mt-2 text-sm text-ink/50">
                {formatCalendarImportAddress(mergedHints) ? (
                  <span className="block">Address from event: {formatCalendarImportAddress(mergedHints)}</span>
                ) : null}
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

        {linkedCustomerId ? (
          <Field label="Property">
            <select
              className={fieldClass}
              value={propertyId || linkedPropertyId}
              onChange={(event) => setPropertyId(event.target.value)}
            >
              <option value="">Choose a property</option>
              {linkedProperties.map((home) => (
                <option key={home.propertyId} value={home.propertyId}>
                  {home.streetAddress}, {home.city}
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

        <Field label={ESTIMATED_ON_SITE_FIELD_LABEL}>
          <EstimatedDurationPicker value={duration} onChange={setDuration} />
          <p className="mt-1.5 text-sm text-ink/60">{ESTIMATED_ON_SITE_FIELD_HINT}</p>
        </Field>

        <Field label="Service type" id="calendar-import-service-type">
          <div className="flex flex-wrap gap-2">
            {SERVICES.map((item) => (
              <button
                key={item}
                type="button"
                data-service-type={item}
                aria-pressed={shownServiceType === item}
                onClick={() => setServiceType(item)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                  shownServiceType === item ? "bg-gold text-ink" : "bg-white text-ink/70 ring-1 ring-ink/15"
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
          {cleaningQuote && headcountEstimate ? (
            <>
              {estimateSizeLine ? <p className="mt-2 text-sm text-ink/70">{estimateSizeLine}</p> : null}
              <p className={`text-sm text-ink/70 ${estimateSizeLine ? "" : "mt-2"}`}>
                Estimated time on site is {headcountEstimate.text} with {headcount}{" "}
                {headcount === 1 ? "cleaner" : "cleaners"}.
              </p>
            </>
          ) : null}
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
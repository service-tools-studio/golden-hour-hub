"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useHub } from "@/components/hub-provider";
import { CleaningForm, type CleaningValues } from "@/components/admin/cleaning-form";
import { Notice, PageHeader, Screen } from "@/components/ui";
import { isValidDate, isValidLocalTime, minutesFromTime } from "@/lib/domain/time";
import { formatLongDate } from "@/lib/format";

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
  const serviceDate = isValidDate(date) ? date : hub.today;
  const [shownDate, setShownDate] = useState(serviceDate);
  const cleaner = hub.cleaners.find((item) => item.cleanerId === cleanerId && item.status === "ACTIVE");
  const fromAvailability = Boolean(
    cleaner && isValidDate(date) && isValidLocalTime(start) && isValidLocalTime(end) && minutesFromTime(end) > minutesFromTime(start),
  );
  const openBooking = cleanerId === "";
  const knownCustomer = hub.customers.some((item) => item.customerId === initialCustomerId);
  const customerId = knownCustomer ? initialCustomerId : "";
  const propertyId = knownCustomer
    ? (hub.properties.find((item) => item.customerId === initialCustomerId && item.status === "ACTIVE")?.propertyId ?? "")
    : "";
  const arrivalStart = fromAvailability && isValidLocalTime(start) ? start : "08:00";
  const returnTo = fromAvailability
    ? `/admin/jobs/new?cleanerId=${cleanerId}&date=${date}&start=${start}&end=${end}`
    : `/admin/jobs/new?date=${serviceDate}`;

  function submit(values: CleaningValues, nextHref?: string) {
    const result = hub.createJob({
      date: values.date,
      customerId: values.customerId,
      propertyId: values.propertyId,
      serviceType: values.serviceType,
      arrivalWindowStart: values.arrivalWindowStart,
      arrivalWindowEnd: values.arrivalWindowEnd,
      headcountNeeded: values.headcountNeeded,
      expectedDurationMinutes: values.expectedDurationMinutes,
      cleanerIds: values.cleanerIds,
      specialInstructions: values.specialInstructions,
    });
    if (!result.ok || !result.jobId) {
      return { ok: false, message: result.ok ? "The cleaning could not be created." : result.message };
    }
    if (result.message) hub.flash(result.message);
    router.push(nextHref ?? `/admin/jobs/${result.jobId}`);
    return { ok: true };
  }

  if (!fromAvailability && !openBooking) {
    return (
      <Screen>
        <PageHeader title="New cleaning" crumb={{ href: "/admin/schedule", label: "Schedule" }} />
        <div className="px-5 pt-4">
          <Notice>That availability window could not be opened.</Notice>
        </div>
      </Screen>
    );
  }

  const initial: CleaningValues = {
    date: serviceDate,
    customerId,
    propertyId,
    serviceType: "DEEP_CLEAN",
    arrivalWindowStart: arrivalStart,
    arrivalWindowEnd: arrivalStart,
    expectedDurationMinutes: 240,
    headcountNeeded: 1,
    specialInstructions: "",
    cleanerIds: fromAvailability && cleaner ? [cleaner.cleanerId] : [],
  };

  return (
    <Screen>
      <PageHeader
        title="New cleaning"
        subtitle={formatLongDate(shownDate)}
        crumb={{ href: `/admin/schedule?date=${serviceDate}`, label: "Schedule" }}
      />
      <CleaningForm
        initial={initial}
        leadCleanerId={fromAvailability ? cleaner?.cleanerId : undefined}
        canClearCleaners={openBooking}
        estimateOnLoad
        onDateChange={setShownDate}
        newCustomerHref={`/admin/customers/new?returnTo=${encodeURIComponent(returnTo)}`}
        onSubmit={submit}
      />
    </Screen>
  );
}

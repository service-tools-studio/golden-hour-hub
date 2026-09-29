"use client";

import { useRouter } from "next/navigation";
import { useHub } from "@/components/hub-provider";
import { CleaningForm, type CleaningValues } from "@/components/admin/cleaning-form";
import { Notice, PageHeader, Screen } from "@/components/ui";
import { isValidDate, isValidLocalTime, minutesFromTime } from "@/lib/domain/time";
import { formatLongDate, hourWindows } from "@/lib/format";

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
  const ready = Boolean(
    cleaner && isValidDate(date) && isValidLocalTime(start) && isValidLocalTime(end) && minutesFromTime(end) > minutesFromTime(start),
  );
  const knownCustomer = hub.customers.some((item) => item.customerId === initialCustomerId);
  const customerId = knownCustomer ? initialCustomerId : "";
  const propertyId = knownCustomer
    ? (hub.properties.find((item) => item.customerId === initialCustomerId && item.status === "ACTIVE")?.propertyId ?? "")
    : "";
  const arrivalWindows = hourWindows(start, end);
  const arrivalStart = arrivalWindows[0]?.start ?? start;
  const arrivalEnd = arrivalWindows[0]?.end ?? end;

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

  const initial: CleaningValues = {
    date,
    customerId,
    propertyId,
    serviceType: "DEEP_CLEAN",
    arrivalWindowStart: arrivalStart,
    arrivalWindowEnd: arrivalEnd,
    expectedDurationMinutes: 240,
    headcountNeeded: 1,
    specialInstructions: "",
    cleanerIds: [cleaner.cleanerId],
  };

  return (
    <Screen>
      <PageHeader
        title="New cleaning"
        subtitle={formatLongDate(date)}
        crumb={{ href: `/admin/schedule?date=${date}`, label: "Schedule" }}
      />
      <CleaningForm
        initial={initial}
        arrivalWindows={arrivalWindows}
        leadCleanerId={cleaner.cleanerId}
        estimateOnLoad
        newCustomerHref={`/admin/customers/new?returnTo=${encodeURIComponent(`/admin/jobs/new?cleanerId=${cleanerId}&date=${date}&start=${start}&end=${end}`)}`}
        onSubmit={submit}
      />
    </Screen>
  );
}

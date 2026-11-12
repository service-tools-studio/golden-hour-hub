import { validateOptionalVisitArrival } from "../domain/arrival.ts";
import { validateOptionalDurationMinutes } from "../domain/duration.ts";
import { snapshotVisit } from "../domain/customers.ts";
import { CROSS_MARKET_STAFFING_MESSAGE, cleanerMatchesJobMarket } from "../domain/markets.ts";
import { mergeRecurringHorizon, validateRecurrenceRule } from "../domain/recurrence.ts";
import { dayOfWeek, isValidDate } from "../domain/time.ts";
import type { Job, RecurrenceRule, RecurringSeries, ServiceType } from "../domain/types.ts";
import type { HubData } from "../mock/seed.ts";

export type CreateJobInput = {
  date: string;
  customerId: string;
  propertyId: string;
  serviceType: ServiceType;
  arrivalWindowStart?: string;
  arrivalWindowEnd?: string;
  headcountNeeded: number;
  expectedDurationMinutes?: number;
  cleanerIds: string[];
  specialInstructions: string;
  pricePerVisitCents?: number;
  recurringSchedule?: { interval: 1 | 2 | 4 };
};

export type CreateJobResult =
  | { ok: true; hub: HubData; jobId: string; message: string }
  | { ok: false; message: string };

function validatePricePerVisitCents(cents?: number): CreateJobResult | null {
  if (cents === undefined) return null;
  if (!Number.isInteger(cents) || cents < 0) {
    return { ok: false, message: "Enter a valid price per visit." };
  }
  return null;
}

export function createJobOnHub(hub: HubData, input: CreateJobInput, actor: string): CreateJobResult {
  const priceCheck = validatePricePerVisitCents(input.pricePerVisitCents);
  if (priceCheck && !priceCheck.ok) return priceCheck;
  const cleanerIds = [...new Set(input.cleanerIds)];
  const cleaners = cleanerIds.map((cleanerId) => hub.cleaners.find((item) => item.cleanerId === cleanerId));
  if (cleaners.some((cleaner) => !cleaner || cleaner.status !== "ACTIVE")) {
    return { ok: false, message: "Choose an active cleaner." };
  }
  if (!isValidDate(input.date)) return { ok: false, message: "Choose a valid date." };
  const customer = hub.customers.find((item) => item.customerId === input.customerId && item.status === "ACTIVE");
  if (!customer) return { ok: false, message: "Choose a customer." };
  const property = hub.properties.find(
    (item) => item.propertyId === input.propertyId && item.customerId === customer.customerId && item.status === "ACTIVE",
  );
  if (!property) return { ok: false, message: "Choose one of this customer's properties." };
  if (cleaners.some((cleaner) => cleaner && !cleanerMatchesJobMarket(cleaner, property.marketId))) {
    return { ok: false, message: CROSS_MARKET_STAFFING_MESSAGE };
  }
  const arrivalTimes = validateOptionalVisitArrival(input.arrivalWindowStart, input.arrivalWindowEnd);
  if (!arrivalTimes.ok) return arrivalTimes;
  if (!Number.isInteger(input.headcountNeeded) || input.headcountNeeded < 0 || input.headcountNeeded > 12) {
    return { ok: false, message: "Enter how many cleaners are needed." };
  }
  const duration = validateOptionalDurationMinutes(input.expectedDurationMinutes);
  if (!duration.ok) return { ok: false, message: duration.message };
  if (input.recurringSchedule) {
    if (input.serviceType !== "RECURRING") {
      return { ok: false, message: "Recurring schedule applies only to recurring cleans." };
    }
    if (arrivalTimes.arrivalWindowStart === undefined) {
      return { ok: false, message: "Choose a start time before creating a recurring schedule." };
    }
    const headcountForSeries = input.headcountNeeded > 0 ? input.headcountNeeded : 1;
    if (headcountForSeries < 1) {
      return { ok: false, message: "Choose headcount before creating a recurring schedule." };
    }
  }
  const now = new Date().toISOString();
  const jobId = `job-${Date.now()}`;
  const withSeries = Boolean(input.recurringSchedule);
  const job: Job = {
    jobId,
    customerId: customer.customerId,
    propertyId: property.propertyId,
    serviceType: input.serviceType,
    date: input.date,
    headcountNeeded: input.headcountNeeded > 0 ? input.headcountNeeded : withSeries ? 1 : 0,
    expectedDurationMinutes: duration.expectedDurationMinutes,
    arrivalWindowStart: arrivalTimes.arrivalWindowStart,
    arrivalWindowEnd: arrivalTimes.arrivalWindowEnd,
    draftCleanerIds: cleanerIds,
    snapshot: snapshotVisit(customer, property),
    specialInstructions: input.specialInstructions.trim(),
    pricePerVisitCents: input.pricePerVisitCents,
    status: withSeries ? "SCHEDULED" : "DRAFT",
    createdAt: now,
    createdBy: actor,
    updatedAt: now,
    updatedBy: actor,
  };
  if (!input.recurringSchedule) {
    return {
      ok: true,
      hub: { ...hub, jobs: [job, ...hub.jobs] },
      jobId,
      message: "Cleaning saved.",
    };
  }
  const recurrence: RecurrenceRule = {
    frequency: "WEEK",
    interval: input.recurringSchedule.interval,
    daysOfWeek: [dayOfWeek(input.date)],
  };
  const rule = validateRecurrenceRule(recurrence, input.date);
  if (!rule.ok) return rule;
  const seriesArrivalStart = arrivalTimes.arrivalWindowStart;
  const seriesArrivalEnd = arrivalTimes.arrivalWindowEnd;
  if (seriesArrivalStart === undefined || seriesArrivalEnd === undefined) {
    return { ok: false, message: "Choose a start time before creating a recurring schedule." };
  }
  const seriesId = `series-${Date.now()}`;
  const series: RecurringSeries = {
    seriesId,
    customerId: customer.customerId,
    propertyId: property.propertyId,
    recurrence,
    startDate: input.date,
    endMode: "UNTIL_CANCELED",
    defaultHeadcountNeeded: job.headcountNeeded,
    defaultArrivalWindowStart: seriesArrivalStart,
    defaultArrivalWindowEnd: seriesArrivalEnd,
    defaultExpectedDurationMinutes: duration.expectedDurationMinutes,
    defaultServiceType: "RECURRING",
    defaultSpecialInstructions: input.specialInstructions.trim() || undefined,
    defaultPricePerVisitCents: input.pricePerVisitCents,
    staffingTemplateMode: "BLANK",
    staffingTemplate: [],
    status: "ACTIVE",
    generatedThroughDate: input.date,
    createdAt: now,
    createdBy: actor,
    updatedAt: now,
    updatedBy: actor,
  };
  const linkedJob: Job = { ...job, seriesId };
  const base = {
    ...hub,
    series: [...hub.series, series],
    jobs: [linkedJob, ...hub.jobs],
  };
  const generated = mergeRecurringHorizon({
    ...base,
    today: hub.today,
    nowIso: now,
  });
  return {
    ok: true,
    hub: {
      ...base,
      series: generated.series,
      jobs: generated.jobs,
      assignments: generated.assignments,
    },
    jobId,
    message: "Recurring cleaning and schedule saved.",
  };
}

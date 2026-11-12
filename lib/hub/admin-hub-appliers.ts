import {
  normalizeArrivalWindow,
  validateArrivalWindow,
  validateOptionalVisitArrival,
} from "../domain/arrival.ts";
import { validateProposedCrewSize } from "../domain/cleaners.ts";
import { confirmedCompensationCents } from "../domain/compensation.ts";
import {
  findCustomerByExactName,
  snapshotVisit,
  validateCustomerInput,
  type CustomerInput,
} from "../domain/customers.ts";
import { hasKnownDurationMinutes, parseOptionalDurationMinutes, validateOptionalDurationMinutes } from "../domain/duration.ts";
import { CROSS_MARKET_STAFFING_MESSAGE, DEFAULT_MARKET_ID, cleanerMatchesJobMarket } from "../domain/markets.ts";
import { expireJobInvitesIfHeadcountMet } from "../domain/invitations.ts";
import {
  dateMatchesRule,
  effectiveWeekRecurrence,
  mergeRecurringHorizon,
  planOccurrenceStaffing,
  removeStaleSeriesOccurrences,
  seriesScheduleChanged,
  validateRecurrenceRule,
} from "../domain/recurrence.ts";
import {
  applyScheduleConflictWarning,
  availabilityCoversBlockedRange,
  availabilityCoversJobStart,
  calculateBlockedRange,
  calculateConfirmedHeadcount,
  CLEANING_DELETE_BLOCKED_MESSAGE,
  isConfirmedScheduleConflictReason,
  jobHasCleanerBlockingDeletion,
} from "../domain/scheduling.ts";
import { addDays, dayOfWeek, isValidDate, mondayOf } from "../domain/time.ts";
import type {
  AssignmentNotice,
  CleanerProfile,
  Customer,
  Job,
  JobAssignment,
  PayType,
  Property,
  RecurrenceRule,
  RecurringSeries,
} from "../domain/types.ts";
import type { HubData } from "../mock/seed.ts";
import type {
  AdminHubApplierResult,
  DeletedCustomerSnapshot,
  DeletedJobSnapshot,
  SaveCleanerDetailsInput,
  SaveSeriesInput,
  StaffCleanerInput,
  UpdateJobInput,
  UpdateVisitInput,
} from "./admin-hub-types.ts";

export const ACTOR = "kelsey";

export type { AdminHubApplierResult };

function validatePricePerVisitCents(cents?: number): AdminHubApplierResult | null {
  if (cents === undefined) return null;
  if (!Number.isInteger(cents) || cents < 0) {
    return { ok: false, message: "Enter a valid price per visit." };
  }
  return null;
}

function assignmentNotice(input: {
  arrivalWindowStart?: string;
  arrivalWindowEnd?: string;
  expectedDurationMinutes?: number;
  proposedCrewSize: number;
  payType: PayType;
  payPerPersonCents: number;
}): AssignmentNotice {
  return {
    arrivalWindowStart: input.arrivalWindowStart,
    arrivalWindowEnd: input.arrivalWindowEnd,
    expectedDurationMinutes: input.expectedDurationMinutes,
    proposedCrewSize: input.proposedCrewSize,
    payType: input.payType,
    payPerPersonCents: input.payPerPersonCents,
  };
}

function withEarliestArrival(job: Job, _assignments: JobAssignment[]): Job {
  return job;
}

function assignmentSavedMessage(
  cleaner: CleanerProfile,
  assignment: Pick<JobAssignment, "status" | "attentionReason">,
  mode: "INVITE" | "DIRECT",
): string {
  if (
    assignment.status === "CONFIRMED" &&
    isConfirmedScheduleConflictReason(assignment.attentionReason)
  ) {
    return `Assigned to ${cleaner.firstName}. Resolve the schedule conflict on this cleaning.`;
  }
  if (assignment.status === "CONFIRMED") return "Cleaning assigned.";
  if (assignment.status === "INVITED") return "Invitation sent.";
  return `Saved. Waiting for ${cleaner.firstName} to confirm.`;
}

export function saveCustomerOnHub(
  hub: HubData,
  input: CustomerInput,
  customerId?: string,
): AdminHubApplierResult {
  const decision = validateCustomerInput(input);
  if (!decision.ok) return decision;
  const nameCollision = findCustomerByExactName(
    hub.customers,
    decision.value.firstName,
    decision.value.lastName,
    customerId,
  );
  if (nameCollision) {
    return {
      ok: false,
      message: `${nameCollision.firstName} ${nameCollision.lastName} is already a customer.`,
    };
  }
  const now = new Date().toISOString();
  const id = customerId ?? `cust-${Date.now()}`;
  const existing = hub.properties.filter((item) => item.customerId === id);
  const kept = new Set(decision.value.properties.flatMap((item) => (item.propertyId ? [item.propertyId] : [])));
  const removed = existing.filter((item) => !kept.has(item.propertyId));
  const blocked = removed.find(
    (item) =>
      hub.jobs.some((job) => job.propertyId === item.propertyId) ||
      hub.series.some((series) => series.propertyId === item.propertyId),
  );
  if (blocked) {
    return { ok: false, message: "A property with scheduled cleanings cannot be removed." };
  }
  const { properties: propertyInputs, ...person } = decision.value;
  const nextProperties: Property[] = propertyInputs.map((item, index) => {
    const prior = item.propertyId ? existing.find((property) => property.propertyId === item.propertyId) : undefined;
    return {
      propertyId: prior?.propertyId ?? `prop-${Date.now()}-${index}`,
      customerId: id,
      label: item.label,
      streetAddress: item.streetAddress,
      unit: item.unit,
      city: item.city,
      state: item.state,
      zip: item.zip,
      marketId: item.marketId ?? prior?.marketId ?? DEFAULT_MARKET_ID,
      bedrooms: item.bedrooms,
      bathrooms: item.bathrooms,
      squareFeet: item.squareFeet,
      preferences: item.preferences,
      status: prior?.status ?? "ACTIVE",
      createdAt: prior?.createdAt ?? now,
      createdBy: prior?.createdBy ?? ACTOR,
      updatedAt: now,
      updatedBy: ACTOR,
    };
  });
  const priorCustomer = hub.customers.find((item) => item.customerId === id);
  const saved: Customer = {
    customerId: id,
    firstName: person.firstName,
    lastName: person.lastName,
    phone: person.phone,
    email: person.email,
    notes: person.notes,
    status: priorCustomer?.status ?? "ACTIVE",
    createdAt: priorCustomer?.createdAt ?? now,
    createdBy: priorCustomer?.createdBy ?? ACTOR,
    updatedAt: now,
    updatedBy: ACTOR,
  };
  return {
    ok: true,
    hub: {
      ...hub,
      customers: priorCustomer
        ? hub.customers.map((item) => (item.customerId === id ? saved : item))
        : [saved, ...hub.customers],
      properties: [...hub.properties.filter((item) => item.customerId !== id), ...nextProperties],
      jobs: hub.jobs.map((job) => {
        if (job.customerId !== id) return job;
        const home = nextProperties.find((property) => property.propertyId === job.propertyId);
        if (!home) return job;
        return { ...job, snapshot: snapshotVisit(saved, home), updatedAt: now, updatedBy: ACTOR };
      }),
    },
    customerId: id,
  };
}

export function undoDeleteCustomerOnHub(
  hub: HubData,
  snapshot: DeletedCustomerSnapshot,
): AdminHubApplierResult {
  const { customer, properties } = snapshot;
  return {
    ok: true,
    hub: {
      ...hub,
      customers: [...hub.customers, customer].sort(
        (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName),
      ),
      properties: [...hub.properties, ...properties],
    },
    message: "Customer restored.",
  };
}

export function deleteCustomerOnHub(hub: HubData, customerId: string): AdminHubApplierResult {
  const customer = hub.customers.find((item) => item.customerId === customerId);
  if (!customer) return { ok: false, message: "That customer could not be found." };
  if (hub.jobs.some((job) => job.customerId === customerId)) {
    return { ok: false, message: "Remove or reassign this customer's cleanings before deleting them." };
  }
  if (hub.series.some((series) => series.customerId === customerId)) {
    return { ok: false, message: "Delete this customer's recurring schedules before deleting them." };
  }
  return {
    ok: true,
    hub: {
      ...hub,
      customers: hub.customers.filter((item) => item.customerId !== customerId),
      properties: hub.properties.filter((item) => item.customerId !== customerId),
    },
    message: "Customer deleted.",
  };
}

export function saveSeriesOnHub(hub: HubData, seriesId: string, input: SaveSeriesInput): AdminHubApplierResult {
  const priceCheck = validatePricePerVisitCents(input.defaultPricePerVisitCents);
  if (priceCheck && !priceCheck.ok) return priceCheck;
  const series = hub.series.find((item) => item.seriesId === seriesId);
  if (!series) return { ok: false, message: "That recurring service could not be found." };
  const home = hub.properties.find(
    (property) => property.propertyId === input.propertyId && property.customerId === series.customerId,
  );
  if (!home) return { ok: false, message: "Choose one of this customer's properties." };
  if (!Number.isInteger(input.defaultHeadcountNeeded) || input.defaultHeadcountNeeded < 1 || input.defaultHeadcountNeeded > 12) {
    return { ok: false, message: "Enter how many cleaners are needed." };
  }
  const normalizedRecurrence = effectiveWeekRecurrence(
    input.recurrence,
    series.startDate,
    hub.jobs.filter((job) => job.seriesId === seriesId && job.status !== "CANCELED").map((job) => job.date),
  );
  const rule = validateRecurrenceRule(normalizedRecurrence);
  if (!rule.ok) return rule;
  let startDate = series.startDate;
  for (let offset = 0; offset < 14; offset += 1) {
    const candidate = addDays(series.startDate, offset);
    if (dateMatchesRule(normalizedRecurrence, candidate, candidate)) {
      startDate = candidate;
      break;
    }
  }
  const now = new Date().toISOString();
  const nextSeries = hub.series.map((item) =>
    item.seriesId === seriesId
      ? {
          ...item,
          propertyId: input.propertyId,
          recurrence: normalizedRecurrence,
          defaultHeadcountNeeded: input.defaultHeadcountNeeded,
          defaultPricePerVisitCents: input.defaultPricePerVisitCents,
          status: input.status,
          startDate,
          updatedAt: now,
          updatedBy: ACTOR,
        }
      : item,
  );
  const updated = nextSeries.find((item) => item.seriesId === seriesId)!;
  let jobs = hub.jobs;
  let assignments = hub.assignments;
  if (seriesScheduleChanged(series, updated)) {
    const pruned = removeStaleSeriesOccurrences({
      today: hub.today,
      series: updated,
      jobs,
      assignments,
    });
    jobs = pruned.jobs;
    assignments = pruned.assignments;
  }
  const base = { ...hub, series: nextSeries, jobs, assignments };
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
  };
}

export function saveCleanerDetailsOnHub(hub: HubData, input: SaveCleanerDetailsInput): AdminHubApplierResult {
  const job = hub.jobs.find((item) => item.jobId === input.jobId);
  if (!job || job.status === "CANCELED") return { ok: false, message: "That cleaning could not be edited." };
  if (!(job.draftCleanerIds ?? []).includes(input.cleanerId)) {
    return { ok: false, message: "Add that cleaner to the cleaning before saving their details." };
  }
  const already = hub.assignments.some(
    (assignment) =>
      assignment.jobId === job.jobId &&
      assignment.cleanerId === input.cleanerId &&
      assignment.status !== "CANCELED" &&
      assignment.status !== "EXPIRED_JOB_FILLED",
  );
  if (already) return { ok: false, message: "That cleaner is already assigned on this cleaning." };
  const cleaner = hub.cleaners.find((item) => item.cleanerId === input.cleanerId);
  if (!cleaner || cleaner.status !== "ACTIVE") return { ok: false, message: "That cleaner is not active." };
  const customer = hub.customers.find((item) => item.customerId === job.customerId && item.status === "ACTIVE");
  if (!customer) return { ok: false, message: "Choose a customer." };
  const property = hub.properties.find(
    (item) => item.propertyId === input.propertyId && item.customerId === customer.customerId && item.status === "ACTIVE",
  );
  if (!property) return { ok: false, message: "Choose one of this customer's properties." };
  const arrivalTimes = validateOptionalVisitArrival(input.arrivalWindowStart, input.arrivalWindowEnd);
  if (!arrivalTimes.ok) return arrivalTimes;
  const duration = validateOptionalDurationMinutes(input.expectedDurationMinutes);
  if (!duration.ok) return { ok: false, message: duration.message };
  if (job.headcountNeeded < 1) {
    return { ok: false, message: "Set the headcount on this cleaning first." };
  }
  const crew = validateProposedCrewSize(cleaner.maxHelperCount, input.proposedCrewSize);
  if (!crew.ok) return crew;
  if (!Number.isInteger(input.payPerPersonCents) || input.payPerPersonCents < 0) {
    return { ok: false, message: "Enter the pay per person." };
  }
  const now = new Date().toISOString();
  const detail = {
    cleanerId: cleaner.cleanerId,
    arrivalWindowStart: arrivalTimes.arrivalWindowStart,
    arrivalWindowEnd: arrivalTimes.arrivalWindowEnd,
    expectedDurationMinutes: duration.expectedDurationMinutes,
    proposedCrewSize: input.proposedCrewSize,
    payType: input.payType,
    payPerPersonCents: input.payPerPersonCents,
  };
  const details = job.draftCleanerDetails ?? [];
  const next = withEarliestArrival(
    {
      ...job,
      draftCleanerDetails: [...details.filter((item) => item.cleanerId !== cleaner.cleanerId), detail],
      updatedAt: now,
      updatedBy: ACTOR,
    },
    hub.assignments,
  );
  return {
    ok: true,
    hub: {
      ...hub,
      jobs: hub.jobs.map((item) => (item.jobId === job.jobId ? next : item)),
    },
    jobId: job.jobId,
    message: "Details saved.",
  };
}

export function staffCleanerOnHub(hub: HubData, input: StaffCleanerInput): AdminHubApplierResult {
  const job = hub.jobs.find((item) => item.jobId === input.jobId);
  if (!job || job.status === "CANCELED") return { ok: false, message: "That cleaning could not be changed." };
  const detail = job.draftCleanerDetails?.find((item) => item.cleanerId === input.cleanerId);
  if (!detail) return { ok: false, message: "Save this cleaner's details before staffing them." };
  const cleaner = hub.cleaners.find((item) => item.cleanerId === input.cleanerId);
  if (!cleaner || cleaner.status !== "ACTIVE") return { ok: false, message: "That cleaner is not active." };
  if (!cleanerMatchesJobMarket(cleaner, job.snapshot.marketId)) {
    return { ok: false, message: CROSS_MARKET_STAFFING_MESSAGE };
  }
  const already = hub.assignments.some(
    (assignment) =>
      assignment.jobId === job.jobId &&
      assignment.cleanerId === cleaner.cleanerId &&
      assignment.status !== "CANCELED" &&
      assignment.status !== "EXPIRED_JOB_FILLED",
  );
  if (already) return { ok: false, message: "That cleaner is already assigned on this cleaning." };
  const now = new Date().toISOString();
  const weekStart = mondayOf(job.date);
  const availabilityByCleaner: Record<string, { submitted: boolean; windows: { date: string; start: string; end: string }[] }> =
    {};
  for (const candidate of hub.cleaners) {
    availabilityByCleaner[candidate.cleanerId] = {
      submitted: hub.submissions.some(
        (submission) => submission.cleanerId === candidate.cleanerId && submission.weekStart === weekStart,
      ),
      windows: hub.availability
        .filter((window) => window.cleanerId === candidate.cleanerId)
        .map((window) => ({ date: window.date, start: window.start, end: window.end })),
    };
  }
  const plan = planOccurrenceStaffing({
    jobId: job.jobId,
    serviceDate: job.date,
    headcountNeeded: job.headcountNeeded,
    mode: input.mode,
    template: [
      {
        cleanerId: cleaner.cleanerId,
        proposedCrewSize: detail.proposedCrewSize,
        arrivalWindowStart: detail.arrivalWindowStart,
        arrivalWindowEnd: detail.arrivalWindowEnd,
        expectedDurationMinutes: detail.expectedDurationMinutes,
        payType: detail.payType,
        payPerPersonCents: detail.payPerPersonCents,
      },
    ],
    cleaners: hub.cleaners,
    availabilityByCleaner,
    confirmedAssignments: hub.assignments.filter((assignment) => assignment.status === "CONFIRMED"),
    nowIso: now,
    newId: () => `as-${Date.now()}`,
  });
  if (plan.attention.length > 0) return { ok: false, message: plan.attention[0].reason };
  const planned = plan.assignments[0];
  if (!planned) return { ok: false, message: "The cleaning could not be assigned." };
  const assignment: JobAssignment = {
    ...planned,
    lastNotified: assignmentNotice(detail),
    notifiedServiceDate: job.date,
  };
  let nextAssignments = [...hub.assignments, assignment];
  if (input.mode === "DIRECT" || assignment.status === "CONFIRMED") {
    nextAssignments = expireJobInvitesIfHeadcountMet(nextAssignments, job.jobId, job.headcountNeeded, now);
  }
  const next = withEarliestArrival(
    {
      ...job,
      draftCleanerIds: (job.draftCleanerIds ?? []).filter((id) => id !== cleaner.cleanerId),
      draftCleanerDetails: (job.draftCleanerDetails ?? []).filter((item) => item.cleanerId !== cleaner.cleanerId),
      status: "SCHEDULED" as const,
      updatedAt: now,
      updatedBy: ACTOR,
    },
    nextAssignments,
  );
  const message = assignmentSavedMessage(cleaner, assignment, input.mode);
  return {
    ok: true,
    hub: {
      ...hub,
      jobs: hub.jobs.map((item) => (item.jobId === job.jobId ? next : item)),
      assignments: nextAssignments,
    },
    jobId: job.jobId,
    message,
  };
}

export function addJobCleanerOnHub(hub: HubData, jobId: string, cleanerId: string): AdminHubApplierResult {
  const job = hub.jobs.find((item) => item.jobId === jobId);
  if (!job || job.status === "CANCELED") return { ok: false, message: "That cleaning could not be changed." };
  const cleaner = hub.cleaners.find((item) => item.cleanerId === cleanerId);
  if (!cleaner || cleaner.status !== "ACTIVE") return { ok: false, message: "That cleaner is not active." };
  if (!cleanerMatchesJobMarket(cleaner, job.snapshot.marketId)) {
    return { ok: false, message: CROSS_MARKET_STAFFING_MESSAGE };
  }
  const named = (job.draftCleanerIds ?? []).includes(cleaner.cleanerId);
  const assigned = hub.assignments.some(
    (assignment) =>
      assignment.jobId === job.jobId &&
      assignment.cleanerId === cleaner.cleanerId &&
      assignment.status !== "CANCELED" &&
      assignment.status !== "EXPIRED_JOB_FILLED",
  );
  if (named || assigned) return { ok: false, message: `${cleaner.firstName} is already on this cleaning.` };
  const now = new Date().toISOString();
  return {
    ok: true,
    hub: {
      ...hub,
      jobs: hub.jobs.map((item) =>
        item.jobId === job.jobId
          ? {
              ...item,
              draftCleanerIds: [...(item.draftCleanerIds ?? []), cleaner.cleanerId],
              updatedAt: now,
              updatedBy: ACTOR,
            }
          : item,
      ),
    },
    message: `${cleaner.firstName} added.`,
  };
}

export function removeJobCleanerOnHub(hub: HubData, jobId: string, cleanerId: string): AdminHubApplierResult {
  const job = hub.jobs.find((item) => item.jobId === jobId);
  if (!job || job.status === "CANCELED") return { ok: false, message: "That cleaning could not be changed." };
  const cleaner = hub.cleaners.find((item) => item.cleanerId === cleanerId);
  const now = new Date().toISOString();
  const nextAssignments = hub.assignments.map((assignment) =>
    assignment.jobId === job.jobId &&
    assignment.cleanerId === cleanerId &&
    assignment.status !== "CANCELED" &&
    assignment.status !== "EXPIRED_JOB_FILLED"
      ? { ...assignment, status: "CANCELED" as const, updatedAt: now }
      : assignment,
  );
  const next = withEarliestArrival(
    {
      ...job,
      draftCleanerIds: (job.draftCleanerIds ?? []).filter((id) => id !== cleanerId),
      draftCleanerDetails: (job.draftCleanerDetails ?? []).filter((item) => item.cleanerId !== cleanerId),
      updatedAt: now,
      updatedBy: ACTOR,
    },
    nextAssignments,
  );
  return {
    ok: true,
    hub: {
      ...hub,
      jobs: hub.jobs.map((item) => (item.jobId === job.jobId ? next : item)),
      assignments: nextAssignments,
    },
    message: cleaner ? `${cleaner.firstName} removed.` : "Cleaner removed.",
  };
}

export function updateVisitOnHub(hub: HubData, input: UpdateVisitInput): AdminHubApplierResult {
  const priceCheck = validatePricePerVisitCents(input.pricePerVisitCents);
  if (priceCheck && !priceCheck.ok) return priceCheck;
  const job = hub.jobs.find((item) => item.jobId === input.jobId);
  if (!job || job.status === "CANCELED") return { ok: false, message: "That cleaning could not be edited." };
  const customer = hub.customers.find((item) => item.customerId === input.customerId && item.status === "ACTIVE");
  if (!customer) return { ok: false, message: "Choose a customer." };
  const cleanerIds = [...new Set(input.cleanerIds)];
  const cleaners = cleanerIds.map((id) => hub.cleaners.find((item) => item.cleanerId === id));
  if (cleaners.some((c) => !c || c.status !== "ACTIVE")) {
    return { ok: false, message: "Choose an active cleaner." };
  }
  const property = hub.properties.find(
    (item) => item.propertyId === input.propertyId && item.customerId === customer.customerId && item.status === "ACTIVE",
  );
  if (!property) return { ok: false, message: "Choose one of this customer's properties." };
  if (cleaners.some((cleaner) => cleaner && !cleanerMatchesJobMarket(cleaner, property.marketId))) {
    return { ok: false, message: CROSS_MARKET_STAFFING_MESSAGE };
  }
  if (!isValidDate(input.date)) return { ok: false, message: "Choose a date." };
  const arrivalTimes = validateOptionalVisitArrival(input.arrivalWindowStart, input.arrivalWindowEnd);
  if (!arrivalTimes.ok) return arrivalTimes;
  const duration = validateOptionalDurationMinutes(input.expectedDurationMinutes);
  if (!duration.ok) return { ok: false, message: duration.message };
  const visitDuration = duration.expectedDurationMinutes;
  if (!Number.isInteger(input.headcountNeeded) || input.headcountNeeded < 0 || input.headcountNeeded > 12) {
    return { ok: false, message: "Enter how many cleaners are needed." };
  }
  if (input.recurringSchedule) {
    if (job.seriesId) {
      return { ok: false, message: "This cleaning already belongs to a recurring schedule." };
    }
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
  const activeAssignments = hub.assignments.filter(
    (assignment) =>
      assignment.jobId === job.jobId &&
      cleanerIds.includes(assignment.cleanerId) &&
      assignment.status !== "CANCELED" &&
      assignment.status !== "EXPIRED_JOB_FILLED" &&
      assignment.status !== "DECLINED",
  );
  const covered = new Set(activeAssignments.map((assignment) => assignment.cleanerId));
  const crews = [
    ...activeAssignments.map(
      (assignment) => assignment.confirmedCrewSize ?? assignment.proposedCrewSize,
    ),
    ...(job.draftCleanerDetails ?? [])
      .filter((detail) => cleanerIds.includes(detail.cleanerId) && !covered.has(detail.cleanerId))
      .map((detail) => detail.proposedCrewSize),
  ];
  if (crews.some((size) => size > input.headcountNeeded)) {
    return { ok: false, message: "The headcount is smaller than a cleaner's crew on this cleaning." };
  }
  const dateChanged = input.date !== job.date;
  if (
    dateChanged &&
    job.seriesId &&
    hub.jobs.some(
      (item) =>
        item.seriesId === job.seriesId && item.jobId !== job.jobId && item.date === input.date && item.status !== "CANCELED",
    )
  ) {
    return { ok: false, message: "This schedule already has a cleaning on that date." };
  }
  const requestedArrivals = new Map((input.cleanerArrivals ?? []).map((arrival) => [arrival.cleanerId, arrival]));
  for (const arrival of requestedArrivals.values()) {
    const perCleaner = validateArrivalWindow(arrival.arrivalWindowStart, arrival.arrivalWindowEnd);
    if (!perCleaner.ok) return perCleaner;
  }
  const now = new Date().toISOString();
  const arrival = {
    start: arrivalTimes.arrivalWindowStart,
    end: arrivalTimes.arrivalWindowEnd,
  };
  const selected = new Set(cleanerIds);
  const nextAssignments = hub.assignments.map((item) => {
    if (item.jobId !== job.jobId) return item;
    const removed = !selected.has(item.cleanerId) && item.status !== "CANCELED" && item.status !== "EXPIRED_JOB_FILLED";
    if (removed) {
      return { ...item, status: "CANCELED" as const, updatedAt: now };
    }
    const tracksDate = item.status === "INVITED" || item.status === "CONFIRMED";
    const baseline = item.notifiedServiceDate ?? item.serviceDate;
    const needsReinvite = tracksDate && input.date !== baseline;
    const notifiedServiceDate = tracksDate ? baseline : item.notifiedServiceDate;
    const requested = requestedArrivals.get(item.cleanerId);
    const normalizedRequested = requested ? normalizeArrivalWindow(requested.arrivalWindowStart) : null;
    const arrivalChanged = Boolean(
      normalizedRequested &&
        (normalizedRequested.arrivalWindowStart !== item.arrivalWindowStart ||
          normalizedRequested.arrivalWindowEnd !== item.arrivalWindowEnd),
    );
    const dateChangedForCleaner =
      item.serviceDate !== input.date ||
      Boolean(item.needsDateReinvite) !== needsReinvite ||
      item.notifiedServiceDate !== notifiedServiceDate;
    const onVisit =
      selected.has(item.cleanerId) && item.status !== "CANCELED" && item.status !== "EXPIRED_JOB_FILLED";
    const durationOutOfSync =
      onVisit && parseOptionalDurationMinutes(item.expectedDurationMinutes) !== parseOptionalDurationMinutes(visitDuration);
    if (!dateChangedForCleaner && !arrivalChanged && !durationOutOfSync) return item;
    const nextArrivalStart = normalizedRequested?.arrivalWindowStart ?? item.arrivalWindowStart;
    const nextArrivalEnd = normalizedRequested?.arrivalWindowEnd ?? item.arrivalWindowEnd;
    let nextLastNotified = item.lastNotified;
    if (arrivalChanged && nextLastNotified && nextLastNotified.arrivalWindowStart === nextArrivalStart) {
      nextLastNotified = { ...nextLastNotified, arrivalWindowEnd: nextArrivalEnd };
    }
    return {
      ...item,
      serviceDate: input.date,
      notifiedServiceDate,
      needsDateReinvite: needsReinvite ? true : undefined,
      arrivalWindowStart: nextArrivalStart,
      arrivalWindowEnd: nextArrivalEnd,
      expectedDurationMinutes: onVisit ? visitDuration : item.expectedDurationMinutes,
      lastNotified: durationOutOfSync && !item.lastNotified ? assignmentNotice(item) : nextLastNotified,
      updatedAt: now,
    };
  });
  const stillOnJob = new Set(
    nextAssignments
      .filter(
        (item) => item.jobId === job.jobId && item.status !== "CANCELED" && item.status !== "EXPIRED_JOB_FILLED",
      )
      .map((item) => item.cleanerId),
  );
  const draftCleanerIds = cleanerIds.filter((id) => !stillOnJob.has(id));
  const headcountNeeded =
    input.headcountNeeded > 0 ? input.headcountNeeded : input.recurringSchedule ? 1 : input.headcountNeeded;
  const updatedJob: Job = {
    ...job,
    customerId: customer.customerId,
    date: input.date,
    propertyId: property.propertyId,
    serviceType: input.serviceType,
    arrivalWindowStart: arrival.start,
    arrivalWindowEnd: arrival.end,
    expectedDurationMinutes: visitDuration,
    headcountNeeded,
    draftCleanerIds,
    draftCleanerDetails: (job.draftCleanerDetails ?? [])
      .filter((detail) => draftCleanerIds.includes(detail.cleanerId))
      .map((detail) => {
        const requested = requestedArrivals.get(detail.cleanerId);
        const normalized = requested ? normalizeArrivalWindow(requested.arrivalWindowStart) : null;
        return {
          ...detail,
          arrivalWindowStart: normalized?.arrivalWindowStart ?? detail.arrivalWindowStart,
          arrivalWindowEnd: normalized?.arrivalWindowEnd ?? detail.arrivalWindowEnd,
          expectedDurationMinutes: visitDuration,
        };
      }),
    snapshot: snapshotVisit(customer, property),
    specialInstructions: input.specialInstructions.trim(),
    pricePerVisitCents: input.pricePerVisitCents,
    status: input.recurringSchedule && job.status === "DRAFT" ? "SCHEDULED" : job.status,
    updatedAt: now,
    updatedBy: ACTOR,
  };
  const seriesPatch =
    dateChanged && job.seriesId
      ? hub.series.map((item) => {
          if (item.seriesId !== job.seriesId) return item;
          const skipped = new Set([...(item.skippedDates ?? []), job.date]);
          skipped.delete(input.date);
          return { ...item, skippedDates: [...skipped], updatedAt: now, updatedBy: ACTOR };
        })
      : hub.series;

  if (input.recurringSchedule && !job.seriesId) {
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
      defaultHeadcountNeeded: headcountNeeded,
      defaultArrivalWindowStart: seriesArrivalStart,
      defaultArrivalWindowEnd: seriesArrivalEnd,
      defaultExpectedDurationMinutes: visitDuration,
      defaultServiceType: "RECURRING",
      defaultSpecialInstructions: input.specialInstructions.trim() || undefined,
      defaultPricePerVisitCents: input.pricePerVisitCents,
      staffingTemplateMode: "BLANK",
      staffingTemplate: [],
      status: "ACTIVE",
      generatedThroughDate: input.date,
      createdAt: now,
      createdBy: ACTOR,
      updatedAt: now,
      updatedBy: ACTOR,
    };
    const linkedJob: Job = { ...updatedJob, seriesId };
    const base = {
      ...hub,
      series: [...seriesPatch, series],
      jobs: hub.jobs.map((item) => (item.jobId === job.jobId ? linkedJob : item)),
      assignments: nextAssignments,
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
      message: "Recurring schedule created.",
    };
  }

  return {
    ok: true,
    hub: {
      ...hub,
      series: seriesPatch,
      jobs: hub.jobs.map((item) => (item.jobId === job.jobId ? updatedJob : item)),
      assignments: nextAssignments,
    },
    message: "Cleaning updated.",
  };
}

export function updateJobOnHub(hub: HubData, input: UpdateJobInput): AdminHubApplierResult {
  const job = hub.jobs.find((item) => item.jobId === input.jobId);
  if (!job || job.status !== "SCHEDULED") return { ok: false, message: "That cleaning could not be edited." };
  const assignment = hub.assignments.find(
    (item) => item.assignmentId === input.assignmentId && item.jobId === job.jobId,
  );
  if (!assignment) return { ok: false, message: "That cleaner assignment could not be found." };
  const cleaner = hub.cleaners.find((item) => item.cleanerId === assignment.cleanerId);
  if (!cleaner) return { ok: false, message: "That cleaner could not be found." };
  const customer = hub.customers.find((item) => item.customerId === job.customerId);
  if (!customer) return { ok: false, message: "That customer could not be found." };
  const property = hub.properties.find(
    (item) => item.propertyId === input.propertyId && item.customerId === customer.customerId && item.status === "ACTIVE",
  );
  if (!property) return { ok: false, message: "Choose one of this customer's properties." };
  const arrivalTimes = validateArrivalWindow(input.arrivalWindowStart, input.arrivalWindowEnd);
  if (!arrivalTimes.ok) return arrivalTimes;
  const duration = validateOptionalDurationMinutes(input.expectedDurationMinutes);
  if (!duration.ok) return { ok: false, message: duration.message };
  const assignmentDuration = duration.expectedDurationMinutes;
  if (!Number.isInteger(input.headcountNeeded) || input.headcountNeeded < 1 || input.headcountNeeded > 12) {
    return { ok: false, message: "Enter how many cleaners are needed." };
  }
  const crew = validateProposedCrewSize(cleaner.maxHelperCount, input.proposedCrewSize);
  if (!crew.ok) return crew;
  if (input.proposedCrewSize > input.headcountNeeded) {
    return { ok: false, message: "The crew is larger than the headcount for this cleaning." };
  }
  if (!Number.isInteger(input.payPerPersonCents) || input.payPerPersonCents < 0) {
    return { ok: false, message: "Enter the pay per person." };
  }
  const others = hub.assignments.filter(
    (item) => item.jobId === job.jobId && item.assignmentId !== assignment.assignmentId,
  );
  if (
    assignment.status === "CONFIRMED" &&
    calculateConfirmedHeadcount(others) + input.proposedCrewSize > input.headcountNeeded
  ) {
    return { ok: false, message: "The crew is larger than the headcount for this cleaning." };
  }
  if (assignment.status === "CONFIRMED") {
    const weekStart = mondayOf(job.date);
    const submitted = hub.submissions.some(
      (submission) => submission.cleanerId === cleaner.cleanerId && submission.weekStart === weekStart,
    );
    if (!submitted) return { ok: false, message: `${cleaner.firstName} has not submitted this week.` };
    const windows = hub.availability
      .filter((window) => window.cleanerId === cleaner.cleanerId)
      .map((window) => ({ date: window.date, start: window.start, end: window.end }));
    if (assignmentDuration !== undefined) {
      const blocked = calculateBlockedRange({
        date: job.date,
        arrivalWindowStart: arrivalTimes.arrivalWindowStart,
        arrivalWindowEnd: arrivalTimes.arrivalWindowEnd,
        expectedDurationMinutes: assignmentDuration,
      });
      if (!availabilityCoversBlockedRange(windows, blocked)) {
        return { ok: false, message: `This schedule is outside ${cleaner.firstName}'s submitted availability.` };
      }
    } else if (
      !availabilityCoversJobStart(windows, job.date, arrivalTimes.arrivalWindowStart)
    ) {
      return { ok: false, message: `This schedule is outside ${cleaner.firstName}'s submitted availability.` };
    }
  }
  const now = new Date().toISOString();
  const pay = confirmedCompensationCents({
    payType: input.payType,
    payPerPersonCents: input.payPerPersonCents,
    confirmedCrewSize: input.proposedCrewSize,
  });
  const blocked =
    assignmentDuration !== undefined &&
    (assignment.status === "CONFIRMED" || assignment.status === "NEEDS_ATTENTION")
      ? calculateBlockedRange({
          date: job.date,
          arrivalWindowStart: arrivalTimes.arrivalWindowStart,
          arrivalWindowEnd: arrivalTimes.arrivalWindowEnd,
          expectedDurationMinutes: assignmentDuration,
        })
      : null;
  const nextAssignments = hub.assignments.map((item) => {
    if (item.assignmentId !== assignment.assignmentId) return item;
    let nextItem: JobAssignment = {
      ...item,
      proposedCrewSize: input.proposedCrewSize,
      confirmedCrewSize: item.status === "CONFIRMED" ? input.proposedCrewSize : item.confirmedCrewSize,
      arrivalWindowStart: arrivalTimes.arrivalWindowStart,
      arrivalWindowEnd: arrivalTimes.arrivalWindowEnd,
      expectedDurationMinutes: assignmentDuration,
      payType: input.payType,
      payPerPersonCents: input.payPerPersonCents,
      proposedTotalPayCents: pay,
      confirmedTotalPayCents: item.status === "CONFIRMED" ? pay : item.confirmedTotalPayCents,
      updatedAt: now,
    };
    if (assignment.status === "CONFIRMED" || assignment.status === "NEEDS_ATTENTION") {
      const merged = hub.assignments.map((row) => (row.assignmentId === assignment.assignmentId ? nextItem : row));
      nextItem = applyScheduleConflictWarning(nextItem, cleaner, merged);
    }
    return nextItem;
  });
  const next = withEarliestArrival(
    {
      ...job,
      headcountNeeded: input.headcountNeeded,
      updatedAt: now,
      updatedBy: ACTOR,
    },
    nextAssignments,
  );
  return {
    ok: true,
    hub: {
      ...hub,
      jobs: hub.jobs.map((item) => (item.jobId === job.jobId ? next : item)),
      assignments: nextAssignments,
    },
    message: "Assignment saved.",
  };
}

export function moveAssignmentTimeOnHub(
  hub: HubData,
  assignmentId: string,
  arrivalWindowStart: string,
  arrivalWindowEnd: string,
): AdminHubApplierResult {
  const assignment = hub.assignments.find((item) => item.assignmentId === assignmentId);
  if (
    !assignment ||
    assignment.status === "CANCELED" ||
    assignment.status === "DECLINED" ||
    assignment.status === "EXPIRED_JOB_FILLED"
  ) {
    return { ok: false, message: "That cleaning could not be moved." };
  }
  const moved = validateArrivalWindow(arrivalWindowStart, arrivalWindowEnd);
  if (!moved.ok) return moved;
  const job = hub.jobs.find((item) => item.jobId === assignment.jobId);
  if (!job || job.status === "CANCELED") return { ok: false, message: "That cleaning could not be moved." };
  const cleaner = hub.cleaners.find((item) => item.cleanerId === assignment.cleanerId);
  if (!cleaner) return { ok: false, message: "That cleaner could not be found." };
  const now = new Date().toISOString();
  const blocked =
    hasKnownDurationMinutes(assignment.expectedDurationMinutes) &&
    (assignment.status === "CONFIRMED" || assignment.status === "NEEDS_ATTENTION")
      ? calculateBlockedRange({
          date: assignment.serviceDate,
          arrivalWindowStart: moved.arrivalWindowStart,
          arrivalWindowEnd: moved.arrivalWindowEnd,
          expectedDurationMinutes: assignment.expectedDurationMinutes,
        })
      : null;
  return {
    ok: true,
    hub: {
      ...hub,
      assignments: hub.assignments.map((item) => {
        if (item.assignmentId !== assignment.assignmentId) return item;
        let nextItem: JobAssignment = {
          ...item,
          arrivalWindowStart: moved.arrivalWindowStart,
          arrivalWindowEnd: moved.arrivalWindowEnd,
          updatedAt: now,
        };
        if (blocked) {
          const merged = hub.assignments.map((row) => (row.assignmentId === assignment.assignmentId ? nextItem : row));
          nextItem = applyScheduleConflictWarning(nextItem, cleaner, merged);
        }
        return nextItem;
      }),
    },
  };
}

export function markAssignmentNotifiedOnHub(hub: HubData, assignmentId: string): AdminHubApplierResult {
  const assignment = hub.assignments.find((item) => item.assignmentId === assignmentId);
  if (
    !assignment ||
    assignment.status === "CANCELED" ||
    assignment.status === "DECLINED" ||
    assignment.status === "EXPIRED_JOB_FILLED"
  ) {
    return { ok: false, message: "That assignment could not be updated." };
  }
  const now = new Date().toISOString();
  return {
    ok: true,
    hub: {
      ...hub,
      assignments: hub.assignments.map((item) =>
        item.assignmentId === assignment.assignmentId
          ? {
              ...item,
              lastNotified: assignmentNotice(item),
              notifiedServiceDate: item.serviceDate,
              updatedAt: now,
            }
          : item,
      ),
    },
  };
}

export function undoDeleteJobOnHub(hub: HubData, snapshot: DeletedJobSnapshot): AdminHubApplierResult {
  const { job, assignments, seriesSkippedDatesBefore } = snapshot;
  return {
    ok: true,
    hub: {
      ...hub,
      jobs: [...hub.jobs, job].sort((a, b) => a.date.localeCompare(b.date) || a.jobId.localeCompare(b.jobId)),
      assignments: [...hub.assignments, ...assignments],
      series: seriesSkippedDatesBefore
        ? hub.series.map((item) =>
            item.seriesId === seriesSkippedDatesBefore.seriesId
              ? { ...item, skippedDates: seriesSkippedDatesBefore.skippedDates }
              : item,
          )
        : hub.series,
    },
    message: "Cleaning restored.",
  };
}

export function deleteJobOnHub(hub: HubData, jobId: string): AdminHubApplierResult {
  const job = hub.jobs.find((item) => item.jobId === jobId);
  if (!job) return { ok: false, message: "That cleaning could not be deleted." };
  if (jobHasCleanerBlockingDeletion(hub.assignments, jobId)) {
    return { ok: false, message: CLEANING_DELETE_BLOCKED_MESSAGE };
  }
  const now = new Date().toISOString();
  return {
    ok: true,
    hub: {
      ...hub,
      series: job.seriesId
        ? hub.series.map((item) =>
            item.seriesId === job.seriesId
              ? {
                  ...item,
                  skippedDates: [...new Set([...(item.skippedDates ?? []), job.date])],
                  updatedAt: now,
                  updatedBy: ACTOR,
                }
              : item,
          )
        : hub.series,
      jobs: hub.jobs.filter((item) => item.jobId !== jobId),
      assignments: hub.assignments.filter((item) => item.jobId !== jobId),
    },
    message: "Cleaning deleted.",
  };
}

export function deleteSeriesOnHub(hub: HubData, seriesId: string): AdminHubApplierResult {
  const series = hub.series.find((item) => item.seriesId === seriesId);
  if (!series) return { ok: false, message: "That recurring schedule could not be deleted." };
  const removedJobIds = new Set(
    hub.jobs.filter((job) => job.seriesId === series.seriesId && job.date >= hub.today).map((job) => job.jobId),
  );
  return {
    ok: true,
    hub: {
      ...hub,
      series: hub.series.filter((item) => item.seriesId !== series.seriesId),
      jobs: hub.jobs.filter((job) => !removedJobIds.has(job.jobId)),
      assignments: hub.assignments.filter((assignment) => !removedJobIds.has(assignment.jobId)),
    },
    message: "Recurring schedule deleted.",
  };
}

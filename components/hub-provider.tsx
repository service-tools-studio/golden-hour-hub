"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { bootstrapHub, persistHub } from "@/app/actions/hub-data";
import { mergeAdjacentWindows } from "@/lib/domain/availability";
import { confirmedCompensationCents } from "@/lib/domain/compensation";
import { deriveCrewSettings, validateProposedCrewSize } from "@/lib/domain/cleaners";
import { snapshotVisit, validateCustomerInput, type CustomerInput } from "@/lib/domain/customers";
import {
  expireRemainingInvitationsWhenFilled,
  revalidatePendingAssignments,
  validateInvitationAcceptance,
  withAssignmentConfirmed,
  withAssignmentDeclined,
  withAssignmentPendingAvailability,
} from "@/lib/domain/invitations";
import { dateMatchesRule, mergeRecurringHorizon, planOccurrenceStaffing, validateRecurrenceRule } from "@/lib/domain/recurrence";
import {
  availabilityCoversBlockedRange,
  calculateBlockedRange,
  calculateConfirmedHeadcount,
  detectConfirmedAssignmentConflict,
  toAssignmentSchedule,
  validateAvailabilityEdit,
} from "@/lib/domain/scheduling";
import { addDays, isValidDate, isValidLocalTime, minutesFromTime, mondayOf, todayInBusinessZone } from "@/lib/domain/time";
import { buildSeed, type HubData } from "@/lib/mock/seed";
import type {
  AppRole,
  AvailabilityWindow,
  CleanerStatus,
  Customer,
  AssignmentNotice,
  Job,
  JobAssignment,
  PayType,
  Property,
  RecurrenceRule,
  SeriesStatus,
  ServiceType,
} from "@/lib/domain/types";

const STORAGE_KEY = "ghh-preview-v2";
const SESSION_KEY = "ghh-session-v2";

type HubState = HubData & {
  role: AppRole | null;
  cleanerId: string | null;
};

type ActionResult = { ok: true; message?: string; customerId?: string; jobId?: string } | { ok: false; message: string };

export type CreateJobInput = {
  date: string;
  customerId: string;
  propertyId: string;
  serviceType: ServiceType;
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  headcountNeeded: number;
  expectedDurationMinutes: number;
  cleanerIds: string[];
  specialInstructions: string;
};

export type SaveCleanerDetailsInput = {
  jobId: string;
  cleanerId: string;
  propertyId: string;
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  expectedDurationMinutes: number;
  proposedCrewSize: number;
  payType: PayType;
  payPerPersonCents: number;
  specialInstructions: string;
};

export type StaffCleanerInput = {
  jobId: string;
  cleanerId: string;
  mode: "INVITE" | "DIRECT";
};

export type CompleteAssignmentInput = SaveCleanerDetailsInput & {
  assignmentId?: string;
  mode: "DRAFT" | "INVITE" | "DIRECT";
};

export type UpdateVisitInput = {
  jobId: string;
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
  cleanerArrivals?: { cleanerId: string; arrivalWindowStart: string; arrivalWindowEnd: string }[];
};

export type UpdateJobInput = {
  jobId: string;
  assignmentId: string;
  propertyId: string;
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  expectedDurationMinutes: number;
  headcountNeeded: number;
  proposedCrewSize: number;
  payType: PayType;
  payPerPersonCents: number;
  specialInstructions: string;
};

type HubContextValue = HubState & {
  ready: boolean;
  flash: (message: string) => void;
  enterAdmin: () => void;
  enterCleaner: (cleanerId: string) => void;
  signOut: () => void;
  acceptInvitation: (assignmentId: string, crewSize: number) => ActionResult;
  declineInvitation: (assignmentId: string) => ActionResult;
  submitAvailability: (cleanerId: string, weekStart: string, windows: AvailabilityWindow[]) => ActionResult;
  saveCustomer: (input: CustomerInput, customerId?: string) => ActionResult;
  saveSeries: (
    seriesId: string,
    input: {
      propertyId: string;
      recurrence: RecurrenceRule;
      defaultHeadcountNeeded: number;
      status: SeriesStatus;
    },
  ) => ActionResult;
  updateCleanerAdmin: (
    cleanerId: string,
    input: { typicalHelperCount: number; maxHelperCount: number; status: CleanerStatus },
  ) => ActionResult;
  createJob: (input: CreateJobInput) => ActionResult;
  saveCleanerDetails: (input: SaveCleanerDetailsInput) => ActionResult;
  staffCleaner: (input: StaffCleanerInput) => ActionResult;
  completeAssignment: (input: CompleteAssignmentInput) => ActionResult;
  addJobCleaner: (jobId: string, cleanerId: string) => ActionResult;
  removeJobCleaner: (jobId: string, cleanerId: string) => ActionResult;
  updateVisit: (input: UpdateVisitInput) => ActionResult;
  updateJob: (input: UpdateJobInput) => ActionResult;
  moveAssignmentTime: (assignmentId: string, arrivalWindowStart: string, arrivalWindowEnd: string) => ActionResult;
  deleteJob: (jobId: string) => ActionResult;
  deleteSeries: (seriesId: string) => ActionResult;
};

const HubContext = createContext<HubContextValue | null>(null);

function assignmentNotice(input: {
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  expectedDurationMinutes: number;
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

function readSession(): { role: AppRole | null; cleanerId: string | null } {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return { role: null, cleanerId: null };
    const parsed = JSON.parse(raw) as { role?: AppRole | null; cleanerId?: string | null };
    return { role: parsed.role ?? null, cleanerId: parsed.cleanerId ?? null };
  } catch {
    return { role: null, cleanerId: null };
  }
}

function readPreview(): HubState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return createState();
    const parsed = JSON.parse(raw) as HubState;
    if (!parsed.cleaners || !parsed.jobs || !parsed.assignments || !parsed.properties) return createState();
    if (parsed.cleaners.some((cleaner) => typeof cleaner.maxHelperCount !== "number")) return createState();
    return { ...withCurrentHorizon(parsed), role: parsed.role ?? null, cleanerId: parsed.cleanerId ?? null };
  } catch {
    return createState();
  }
}

function createState(): HubState {
  const today = todayInBusinessZone();
  return { ...buildSeed(today), role: null, cleanerId: null };
}

function withCurrentHorizon(data: HubData): HubData {
  const today = todayInBusinessZone();
  const generated = mergeRecurringHorizon({
    ...data,
    today,
    nowIso: new Date().toISOString(),
  });
  return { ...data, today, series: generated.series, jobs: generated.jobs, assignments: generated.assignments };
}

export function HubProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<HubState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const sourceRef = useRef<"preview" | "dynamodb" | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const remote = await bootstrapHub();
      if (cancelled) return;
      if (remote.source === "dynamodb") {
        sourceRef.current = "dynamodb";
        const session = readSession();
        setState({
          ...withCurrentHorizon(remote.data),
          role: session.role,
          cleanerId: session.cleanerId,
        });
        return;
      }
      sourceRef.current = "preview";
      setState(readPreview());
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!state || !sourceRef.current) return;
    if (sourceRef.current === "dynamodb") {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ role: state.role, cleanerId: state.cleanerId }));
      void persistHub({
        today: state.today,
        cleaners: state.cleaners,
        customers: state.customers,
        properties: state.properties,
        series: state.series,
        jobs: state.jobs,
        assignments: state.assignments,
        availability: state.availability,
        submissions: state.submissions,
      });
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  if (!state) return <div className="min-h-dvh bg-cream" />;

  const data = state;

  function acceptInvitation(assignmentId: string, crewSize: number): ActionResult {
    if (!data.cleanerId) return { ok: false, message: "This invitation belongs to someone else." };
    const assignment = data.assignments.find((item) => item.assignmentId === assignmentId);
    const job = assignment ? data.jobs.find((item) => item.jobId === assignment.jobId) : undefined;
    const cleaner = data.cleaners.find((item) => item.cleanerId === data.cleanerId);
    if (!assignment || !job || !cleaner) {
      return { ok: false, message: "This invitation is no longer available." };
    }
    const jobAssignments = data.assignments.filter((item) => item.jobId === job.jobId);
    const weekStart = mondayOf(assignment.serviceDate);
    const decision = validateInvitationAcceptance({
      assignment,
      job,
      cleaner,
      requestedCrewSize: crewSize,
      jobAssignments,
      cleanerConfirmedAssignments: data.assignments.filter(
        (item) => item.cleanerId === cleaner.cleanerId && item.status === "CONFIRMED",
      ),
      availabilityWindows: data.availability
        .filter((window) => window.cleanerId === cleaner.cleanerId)
        .map((window) => ({ date: window.date, start: window.start, end: window.end })),
      availabilitySubmitted: data.submissions.some(
        (submission) => submission.cleanerId === cleaner.cleanerId && submission.weekStart === weekStart,
      ),
    });
    if (!decision.ok) return decision;
    const now = new Date().toISOString();
    const updated =
      decision.status === "PENDING_AVAILABILITY"
        ? withAssignmentPendingAvailability(jobAssignments, assignmentId, decision.pendingCrewSize, now)
        : expireRemainingInvitationsWhenFilled(
            withAssignmentConfirmed(
              jobAssignments,
              assignmentId,
              decision.confirmedCrewSize,
              decision.confirmedTotalPayCents,
              now,
            ),
            job.headcountNeeded,
            now,
          );
    setState({
      ...data,
      assignments: [...data.assignments.filter((item) => item.jobId !== job.jobId), ...updated],
    });
    return {
      ok: true,
      message:
        decision.status === "PENDING_AVAILABILITY"
          ? "Saved. This cleaning is confirmed after your availability for that week fits."
          : undefined,
    };
  }

  function declineInvitation(assignmentId: string): ActionResult {
    if (!data.cleanerId) return { ok: false, message: "This invitation belongs to someone else." };
    const assignment = data.assignments.find((item) => item.assignmentId === assignmentId);
    if (!assignment || assignment.cleanerId !== data.cleanerId || assignment.status !== "INVITED") {
      return { ok: false, message: "This invitation is no longer available." };
    }
    setState({
      ...data,
      assignments: withAssignmentDeclined(data.assignments, assignmentId, new Date().toISOString()),
    });
    return { ok: true };
  }

  function submitAvailability(
    cleanerId: string,
    weekStart: string,
    windows: AvailabilityWindow[],
  ): ActionResult {
    const weekEnd = addDays(weekStart, 6);
    const combined = [
      ...data.availability.filter(
        (window) => window.cleanerId !== cleanerId || window.date < weekStart || window.date > weekEnd,
      ),
      ...mergeAdjacentWindows(windows),
    ];
    const decision = validateAvailabilityEdit({
      newWindows: combined
        .filter((window) => window.cleanerId === cleanerId)
        .map((window) => ({ date: window.date, start: window.start, end: window.end })),
      confirmedAssignments: data.assignments
        .filter((item) => item.cleanerId === cleanerId && item.status === "CONFIRMED")
        .map(toAssignmentSchedule),
    });
    if (!decision.ok) return decision;
    const now = new Date().toISOString();
    const existing = data.submissions.find(
      (submission) => submission.cleanerId === cleanerId && submission.weekStart === weekStart,
    );
    const cleaner = data.cleaners.find((item) => item.cleanerId === cleanerId);
    const assignments = cleaner
      ? revalidatePendingAssignments({
          assignments: data.assignments,
          cleaner,
          weekStart,
          weekEnd,
          windows: combined
            .filter((window) => window.cleanerId === cleanerId)
            .map((window) => ({ date: window.date, start: window.start, end: window.end })),
          jobs: data.jobs,
          nowIso: now,
        })
      : data.assignments;
    setState({
      ...data,
      availability: combined,
      assignments,
      submissions: [
        ...data.submissions.filter(
          (submission) => !(submission.cleanerId === cleanerId && submission.weekStart === weekStart),
        ),
        {
          submissionId: existing?.submissionId ?? `sub-${cleanerId}-${weekStart}`,
          cleanerId,
          weekStart,
          submittedAt: existing?.submittedAt ?? now,
          updatedAt: now,
        },
      ],
    });
    return { ok: true, message: "Availability submitted." };
  }

  function saveCustomer(input: CustomerInput, customerId?: string): ActionResult {
    const decision = validateCustomerInput(input);
    if (!decision.ok) return decision;
    const now = new Date().toISOString();
    const id = customerId ?? `cust-${Date.now()}`;
    const existing = data.properties.filter((item) => item.customerId === id);
    const kept = new Set(
      decision.value.properties.flatMap((item) => (item.propertyId ? [item.propertyId] : [])),
    );
    const removed = existing.filter((item) => !kept.has(item.propertyId));
    const blocked = removed.find(
      (item) =>
        data.jobs.some((job) => job.propertyId === item.propertyId) ||
        data.series.some((series) => series.propertyId === item.propertyId),
    );
    if (blocked) {
      return { ok: false, message: "A property with scheduled cleanings cannot be removed." };
    }
    const { properties: propertyInputs, ...person } = decision.value;
    const nextProperties: Property[] = propertyInputs.map((item, index) => {
      const prior = item.propertyId
        ? existing.find((property) => property.propertyId === item.propertyId)
        : undefined;
      return {
        propertyId: prior?.propertyId ?? `prop-${Date.now()}-${index}`,
        customerId: id,
        label: item.label,
        streetAddress: item.streetAddress,
        city: item.city,
        state: item.state,
        zip: item.zip,
        bedrooms: item.bedrooms,
        bathrooms: item.bathrooms,
        squareFeet: item.squareFeet,
        preferences: item.preferences,
        status: prior?.status ?? "ACTIVE",
        createdAt: prior?.createdAt ?? now,
        createdBy: prior?.createdBy ?? "kelsey",
        updatedAt: now,
        updatedBy: "kelsey",
      };
    });
    const priorCustomer = data.customers.find((item) => item.customerId === id);
    const saved: Customer = {
      customerId: id,
      firstName: person.firstName,
      lastName: person.lastName,
      phone: person.phone,
      email: person.email,
      notes: person.notes,
      status: priorCustomer?.status ?? "ACTIVE",
      createdAt: priorCustomer?.createdAt ?? now,
      createdBy: priorCustomer?.createdBy ?? "kelsey",
      updatedAt: now,
      updatedBy: "kelsey",
    };
    setState({
      ...data,
      customers: priorCustomer
        ? data.customers.map((item) => (item.customerId === id ? saved : item))
        : [saved, ...data.customers],
      properties: [...data.properties.filter((item) => item.customerId !== id), ...nextProperties],
      jobs: data.jobs.map((job) => {
        if (job.customerId !== id) return job;
        const home = nextProperties.find((property) => property.propertyId === job.propertyId);
        if (!home) return job;
        return { ...job, snapshot: snapshotVisit(saved, home), updatedAt: now, updatedBy: "kelsey" };
      }),
    });
    return { ok: true, customerId: id };
  }

  function saveSeries(
    seriesId: string,
    input: {
      propertyId: string;
      recurrence: RecurrenceRule;
      defaultHeadcountNeeded: number;
      status: SeriesStatus;
    },
  ): ActionResult {
    const series = data.series.find((item) => item.seriesId === seriesId);
    if (!series) return { ok: false, message: "That recurring service could not be found." };
    const home = data.properties.find(
      (property) => property.propertyId === input.propertyId && property.customerId === series.customerId,
    );
    if (!home) return { ok: false, message: "Choose one of this customer's properties." };
    if (!Number.isInteger(input.defaultHeadcountNeeded) || input.defaultHeadcountNeeded < 1 || input.defaultHeadcountNeeded > 12) {
      return { ok: false, message: "Enter how many cleaners are needed." };
    }
    const rule = validateRecurrenceRule(input.recurrence);
    if (!rule.ok) return rule;
    let startDate = series.startDate;
    for (let offset = 0; offset < 14; offset += 1) {
      const candidate = addDays(series.startDate, offset);
      if (dateMatchesRule(input.recurrence, candidate, candidate)) {
        startDate = candidate;
        break;
      }
    }
    const now = new Date().toISOString();
    setState({
      ...data,
      series: data.series.map((item) =>
        item.seriesId === seriesId
          ? {
              ...item,
              propertyId: input.propertyId,
              recurrence: input.recurrence,
              defaultHeadcountNeeded: input.defaultHeadcountNeeded,
              status: input.status,
              startDate,
              updatedAt: now,
              updatedBy: "kelsey",
            }
          : item,
      ),
    });
    return { ok: true };
  }

  function updateCleanerAdmin(
    cleanerId: string,
    input: { typicalHelperCount: number; maxHelperCount: number; status: CleanerStatus },
  ): ActionResult {
    const crew = deriveCrewSettings(input);
    if (!crew.ok) return crew;
    const now = new Date().toISOString();
    setState({
      ...data,
      cleaners: data.cleaners.map((cleaner) =>
        cleaner.cleanerId === cleanerId
          ? {
              ...cleaner,
              status: input.status,
              typicalHelperCount: crew.typicalHelperCount,
              maxHelperCount: crew.maxHelperCount,
              updatedAt: now,
              updatedBy: "kelsey",
            }
          : cleaner,
      ),
    });
    return { ok: true };
  }

  function createJob(input: CreateJobInput): ActionResult {
    const cleanerIds = [...new Set(input.cleanerIds)];
    const cleaners = cleanerIds.map((cleanerId) => data.cleaners.find((item) => item.cleanerId === cleanerId));
    if (cleaners.some((cleaner) => !cleaner || cleaner.status !== "ACTIVE")) {
      return { ok: false, message: "Choose an active cleaner." };
    }
    if (!isValidDate(input.date)) return { ok: false, message: "Choose a valid date." };
    const customer = data.customers.find((item) => item.customerId === input.customerId && item.status === "ACTIVE");
    if (!customer) return { ok: false, message: "Choose a customer." };
    const property = data.properties.find(
      (item) => item.propertyId === input.propertyId && item.customerId === customer.customerId && item.status === "ACTIVE",
    );
    if (!property) return { ok: false, message: "Choose one of this customer's properties." };
    if (!isValidLocalTime(input.arrivalWindowStart) || !isValidLocalTime(input.arrivalWindowEnd)) {
      return { ok: false, message: "Enter a valid arrival window." };
    }
    if (minutesFromTime(input.arrivalWindowEnd) <= minutesFromTime(input.arrivalWindowStart)) {
      return { ok: false, message: "The arrival window must end after it starts." };
    }
    if (!Number.isInteger(input.headcountNeeded) || input.headcountNeeded < 0 || input.headcountNeeded > 12) {
      return { ok: false, message: "Enter how many cleaners are needed." };
    }
    if (
      !Number.isInteger(input.expectedDurationMinutes) ||
      input.expectedDurationMinutes < 30 ||
      input.expectedDurationMinutes > 12 * 60
    ) {
      return { ok: false, message: "Enter a duration between 30 minutes and 12 hours." };
    }
    const now = new Date().toISOString();
    const jobId = `job-${Date.now()}`;
    const job: Job = {
      jobId,
      customerId: customer.customerId,
      propertyId: property.propertyId,
      serviceType: input.serviceType,
      date: input.date,
      headcountNeeded: input.headcountNeeded,
      expectedDurationMinutes: input.expectedDurationMinutes,
      arrivalWindowStart: input.arrivalWindowStart,
      arrivalWindowEnd: input.arrivalWindowEnd,
      draftCleanerIds: cleanerIds,
      snapshot: snapshotVisit(customer, property),
      specialInstructions: input.specialInstructions.trim(),
      status: "DRAFT",
      createdAt: now,
      createdBy: "kelsey",
      updatedAt: now,
      updatedBy: "kelsey",
    };
    setState({ ...data, jobs: [job, ...data.jobs] });
    return { ok: true, jobId, message: "Cleaning saved." };
  }

  function saveCleanerDetails(input: SaveCleanerDetailsInput): ActionResult {
    const job = data.jobs.find((item) => item.jobId === input.jobId);
    if (!job || job.status === "CANCELED") return { ok: false, message: "That cleaning could not be edited." };
    if (!(job.draftCleanerIds ?? []).includes(input.cleanerId)) {
      return { ok: false, message: "Add that cleaner to the cleaning before saving their details." };
    }
    const already = data.assignments.some(
      (assignment) =>
        assignment.jobId === job.jobId &&
        assignment.cleanerId === input.cleanerId &&
        assignment.status !== "CANCELED" &&
        assignment.status !== "EXPIRED_JOB_FILLED",
    );
    if (already) return { ok: false, message: "That cleaner is already assigned on this cleaning." };
    const cleaner = data.cleaners.find((item) => item.cleanerId === input.cleanerId);
    if (!cleaner || cleaner.status !== "ACTIVE") return { ok: false, message: "That cleaner is not active." };
    const customer = data.customers.find((item) => item.customerId === job.customerId && item.status === "ACTIVE");
    if (!customer) return { ok: false, message: "Choose a customer." };
    const property = data.properties.find(
      (item) => item.propertyId === input.propertyId && item.customerId === customer.customerId && item.status === "ACTIVE",
    );
    if (!property) return { ok: false, message: "Choose one of this customer's properties." };
    if (!isValidLocalTime(input.arrivalWindowStart) || !isValidLocalTime(input.arrivalWindowEnd)) {
      return { ok: false, message: "Enter a valid arrival window." };
    }
    if (minutesFromTime(input.arrivalWindowEnd) <= minutesFromTime(input.arrivalWindowStart)) {
      return { ok: false, message: "The arrival window must end after it starts." };
    }
    if (
      !Number.isInteger(input.expectedDurationMinutes) ||
      input.expectedDurationMinutes < 30 ||
      input.expectedDurationMinutes > 12 * 60
    ) {
      return { ok: false, message: "Enter a duration between 30 minutes and 12 hours." };
    }
    if (job.headcountNeeded < 1) {
      return { ok: false, message: "Set the headcount on this cleaning first." };
    }
    const crew = validateProposedCrewSize(cleaner.maxHelperCount, input.proposedCrewSize);
    if (!crew.ok) return crew;
    if (input.proposedCrewSize > job.headcountNeeded) {
      return { ok: false, message: "The crew is larger than the headcount for this cleaning." };
    }
    if (!Number.isInteger(input.payPerPersonCents) || input.payPerPersonCents < 0) {
      return { ok: false, message: "Enter the pay per person." };
    }
    const now = new Date().toISOString();
    const detail = {
      cleanerId: cleaner.cleanerId,
      arrivalWindowStart: input.arrivalWindowStart,
      arrivalWindowEnd: input.arrivalWindowEnd,
      expectedDurationMinutes: input.expectedDurationMinutes,
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
        updatedBy: "kelsey",
      },
      data.assignments,
    );
    setState({
      ...data,
      jobs: data.jobs.map((item) => (item.jobId === job.jobId ? next : item)),
    });
    return { ok: true, jobId: job.jobId, message: "Details saved." };
  }

  function staffCleaner(input: StaffCleanerInput): ActionResult {
    const job = data.jobs.find((item) => item.jobId === input.jobId);
    if (!job || job.status === "CANCELED") return { ok: false, message: "That cleaning could not be changed." };
    const detail = job.draftCleanerDetails?.find((item) => item.cleanerId === input.cleanerId);
    if (!detail) return { ok: false, message: "Save this cleaner's details before staffing them." };
    const cleaner = data.cleaners.find((item) => item.cleanerId === input.cleanerId);
    if (!cleaner || cleaner.status !== "ACTIVE") return { ok: false, message: "That cleaner is not active." };
    const already = data.assignments.some(
      (assignment) =>
        assignment.jobId === job.jobId &&
        assignment.cleanerId === cleaner.cleanerId &&
        assignment.status !== "CANCELED" &&
        assignment.status !== "EXPIRED_JOB_FILLED",
    );
    if (already) return { ok: false, message: "That cleaner is already assigned on this cleaning." };
    if (detail.proposedCrewSize > job.headcountNeeded) {
      return { ok: false, message: "The crew is larger than the headcount for this cleaning." };
    }
    const now = new Date().toISOString();
    const weekStart = mondayOf(job.date);
    const availabilityByCleaner: Record<string, { submitted: boolean; windows: { date: string; start: string; end: string }[] }> = {};
    for (const candidate of data.cleaners) {
      availabilityByCleaner[candidate.cleanerId] = {
        submitted: data.submissions.some(
          (submission) => submission.cleanerId === candidate.cleanerId && submission.weekStart === weekStart,
        ),
        windows: data.availability
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
      cleaners: data.cleaners,
      availabilityByCleaner,
      confirmedAssignments: data.assignments.filter((assignment) => assignment.status === "CONFIRMED"),
      nowIso: now,
      newId: () => `as-${Date.now()}`,
    });
    if (plan.attention.length > 0) return { ok: false, message: plan.attention[0].reason };
    const assignment = plan.assignments[0];
    if (!assignment) return { ok: false, message: "The cleaning could not be assigned." };
    const nextAssignments = [...data.assignments, assignment];
    const next = withEarliestArrival(
      {
        ...job,
        draftCleanerIds: (job.draftCleanerIds ?? []).filter((id) => id !== cleaner.cleanerId),
        draftCleanerDetails: (job.draftCleanerDetails ?? []).filter((item) => item.cleanerId !== cleaner.cleanerId),
        status: "SCHEDULED" as const,
        updatedAt: now,
        updatedBy: "kelsey",
      },
      nextAssignments,
    );
    setState({
      ...data,
      jobs: data.jobs.map((item) => (item.jobId === job.jobId ? next : item)),
      assignments: nextAssignments,
    });
    const message =
      assignment.status === "CONFIRMED"
        ? "Cleaning assigned."
        : assignment.status === "INVITED"
          ? "Invitation sent."
          : `Saved. Waiting for ${cleaner.firstName} to confirm.`;
    return { ok: true, jobId: job.jobId, message };
  }

  function completeAssignment(input: CompleteAssignmentInput): ActionResult {
    if (input.mode === "DRAFT" && !input.assignmentId) {
      const saved = saveCleanerDetails(input);
      return saved.ok ? { ...saved, message: "Draft saved." } : saved;
    }
    const job = data.jobs.find((item) => item.jobId === input.jobId);
    if (!job || job.status === "CANCELED") return { ok: false, message: "That cleaning could not be edited." };
    const existing = input.assignmentId
      ? data.assignments.find((item) => item.assignmentId === input.assignmentId && item.jobId === job.jobId)
      : undefined;
    if (input.assignmentId && !existing) return { ok: false, message: "That cleaner assignment could not be found." };
    const cleanerId = existing?.cleanerId ?? input.cleanerId;
    const cleaner = data.cleaners.find((item) => item.cleanerId === cleanerId);
    if (!cleaner || cleaner.status !== "ACTIVE") return { ok: false, message: "That cleaner is not active." };
    if (!existing && !(job.draftCleanerIds ?? []).includes(cleaner.cleanerId)) {
      return { ok: false, message: "Add that cleaner to the cleaning before saving their details." };
    }
    if (!isValidLocalTime(input.arrivalWindowStart) || !isValidLocalTime(input.arrivalWindowEnd)) {
      return { ok: false, message: "Enter a valid arrival window." };
    }
    if (minutesFromTime(input.arrivalWindowEnd) <= minutesFromTime(input.arrivalWindowStart)) {
      return { ok: false, message: "The arrival window must end after it starts." };
    }
    if (
      !Number.isInteger(input.expectedDurationMinutes) ||
      input.expectedDurationMinutes < 30 ||
      input.expectedDurationMinutes > 12 * 60
    ) {
      return { ok: false, message: "Enter a duration between 30 minutes and 12 hours." };
    }
    if (job.headcountNeeded < 1) {
      return { ok: false, message: "Set the headcount on this cleaning first." };
    }
    const crew = validateProposedCrewSize(cleaner.maxHelperCount, input.proposedCrewSize);
    if (!crew.ok) return crew;
    if (input.proposedCrewSize > job.headcountNeeded) {
      return { ok: false, message: "The crew is larger than the headcount for this cleaning." };
    }
    if (!Number.isInteger(input.payPerPersonCents) || input.payPerPersonCents < 0) {
      return { ok: false, message: "Enter the pay per person." };
    }
    const now = new Date().toISOString();
    const notice = assignmentNotice(input);
    if (input.mode === "DRAFT" && existing) {
      const pay = confirmedCompensationCents({
        payType: input.payType,
        payPerPersonCents: input.payPerPersonCents,
        confirmedCrewSize: input.proposedCrewSize,
      });
      const nextAssignments = data.assignments.map((item) =>
        item.assignmentId === existing.assignmentId
          ? {
              ...item,
              proposedCrewSize: input.proposedCrewSize,
              pendingCrewSize: item.status === "PENDING_AVAILABILITY" ? input.proposedCrewSize : item.pendingCrewSize,
              confirmedCrewSize: item.status === "CONFIRMED" ? input.proposedCrewSize : item.confirmedCrewSize,
              arrivalWindowStart: input.arrivalWindowStart,
              arrivalWindowEnd: input.arrivalWindowEnd,
              expectedDurationMinutes: input.expectedDurationMinutes,
              payType: input.payType,
              payPerPersonCents: input.payPerPersonCents,
              proposedTotalPayCents: pay,
              confirmedTotalPayCents: item.status === "CONFIRMED" ? pay : item.confirmedTotalPayCents,
              lastNotified: item.lastNotified ?? assignmentNotice(item),
              updatedAt: now,
            }
          : item,
      );
      const next = withEarliestArrival({ ...job, updatedAt: now, updatedBy: "kelsey" }, nextAssignments);
      setState({
        ...data,
        jobs: data.jobs.map((item) => (item.jobId === job.jobId ? next : item)),
        assignments: nextAssignments,
      });
      return { ok: true, jobId: job.jobId, message: "Draft saved." };
    }
    const weekStart = mondayOf(job.date);
    const availabilityByCleaner: Record<string, { submitted: boolean; windows: { date: string; start: string; end: string }[] }> = {};
    for (const candidate of data.cleaners) {
      availabilityByCleaner[candidate.cleanerId] = {
        submitted: data.submissions.some((submission) => submission.cleanerId === candidate.cleanerId && submission.weekStart === weekStart),
        windows: data.availability
          .filter((window) => window.cleanerId === candidate.cleanerId)
          .map((window) => ({ date: window.date, start: window.start, end: window.end })),
      };
    }
    const plan = planOccurrenceStaffing({
      jobId: job.jobId,
      serviceDate: job.date,
      headcountNeeded: job.headcountNeeded,
      mode: input.mode === "INVITE" ? "INVITE" : "DIRECT",
      template: [
        {
          cleanerId: cleaner.cleanerId,
          proposedCrewSize: input.proposedCrewSize,
          arrivalWindowStart: input.arrivalWindowStart,
          arrivalWindowEnd: input.arrivalWindowEnd,
          expectedDurationMinutes: input.expectedDurationMinutes,
          payType: input.payType,
          payPerPersonCents: input.payPerPersonCents,
        },
      ],
      cleaners: data.cleaners,
      availabilityByCleaner,
      confirmedAssignments: data.assignments.filter(
        (item) => item.status === "CONFIRMED" && item.assignmentId !== existing?.assignmentId,
      ),
      nowIso: now,
      newId: () => existing?.assignmentId ?? `as-${Date.now()}`,
    });
    if (plan.attention.length > 0) return { ok: false, message: plan.attention[0].reason };
    const planned = plan.assignments[0];
    if (!planned) return { ok: false, message: "The cleaning could not be assigned." };
    const savedAssignment: JobAssignment = {
      ...planned,
      assignmentId: existing?.assignmentId ?? planned.assignmentId,
      createdAt: existing?.createdAt ?? planned.createdAt,
      lastNotified: notice,
      notifiedServiceDate: job.date,
    };
    const nextAssignments = existing
      ? data.assignments.map((item) => (item.assignmentId === existing.assignmentId ? savedAssignment : item))
      : [...data.assignments, savedAssignment];
    const next = withEarliestArrival(
      {
        ...job,
        draftCleanerIds: (job.draftCleanerIds ?? []).filter((id) => id !== cleaner.cleanerId),
        draftCleanerDetails: (job.draftCleanerDetails ?? []).filter((item) => item.cleanerId !== cleaner.cleanerId),
        status: "SCHEDULED",
        updatedAt: now,
        updatedBy: "kelsey",
      },
      nextAssignments,
    );
    setState({
      ...data,
      jobs: data.jobs.map((item) => (item.jobId === job.jobId ? next : item)),
      assignments: nextAssignments,
    });
    const message =
      savedAssignment.status === "CONFIRMED"
        ? "Cleaning assigned."
        : savedAssignment.status === "INVITED"
          ? "Invitation sent."
          : `Saved. Waiting for ${cleaner.firstName} to confirm.`;
    return { ok: true, jobId: job.jobId, message };
  }

  function addJobCleaner(jobId: string, cleanerId: string): ActionResult {
    const job = data.jobs.find((item) => item.jobId === jobId);
    if (!job || job.status === "CANCELED") return { ok: false, message: "That cleaning could not be changed." };
    const cleaner = data.cleaners.find((item) => item.cleanerId === cleanerId);
    if (!cleaner || cleaner.status !== "ACTIVE") return { ok: false, message: "That cleaner is not active." };
    const named = (job.draftCleanerIds ?? []).includes(cleaner.cleanerId);
    const assigned = data.assignments.some(
      (assignment) =>
        assignment.jobId === job.jobId &&
        assignment.cleanerId === cleaner.cleanerId &&
        assignment.status !== "CANCELED" &&
        assignment.status !== "EXPIRED_JOB_FILLED",
    );
    if (named || assigned) return { ok: false, message: `${cleaner.firstName} is already on this cleaning.` };
    const now = new Date().toISOString();
    setState({
      ...data,
      jobs: data.jobs.map((item) =>
        item.jobId === job.jobId
          ? {
              ...item,
              draftCleanerIds: [...(item.draftCleanerIds ?? []), cleaner.cleanerId],
              updatedAt: now,
              updatedBy: "kelsey",
            }
          : item,
      ),
    });
    return { ok: true, message: `${cleaner.firstName} added.` };
  }

  function removeJobCleaner(jobId: string, cleanerId: string): ActionResult {
    const job = data.jobs.find((item) => item.jobId === jobId);
    if (!job || job.status === "CANCELED") return { ok: false, message: "That cleaning could not be changed." };
    const cleaner = data.cleaners.find((item) => item.cleanerId === cleanerId);
    const now = new Date().toISOString();
    const nextAssignments = data.assignments.map((assignment) =>
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
        updatedBy: "kelsey",
      },
      nextAssignments,
    );
    setState({
      ...data,
      jobs: data.jobs.map((item) => (item.jobId === job.jobId ? next : item)),
      assignments: nextAssignments,
    });
    return { ok: true, message: cleaner ? `${cleaner.firstName} removed.` : "Cleaner removed." };
  }

  function updateVisit(input: UpdateVisitInput): ActionResult {
    const job = data.jobs.find((item) => item.jobId === input.jobId);
    if (!job || job.status === "CANCELED") return { ok: false, message: "That cleaning could not be edited." };
    const customer = data.customers.find((item) => item.customerId === input.customerId && item.status === "ACTIVE");
    if (!customer) return { ok: false, message: "Choose a customer." };
    const cleanerIds = [...new Set(input.cleanerIds)];
    const cleaners = cleanerIds.map((cleanerId) => data.cleaners.find((item) => item.cleanerId === cleanerId));
    if (cleaners.some((cleaner) => !cleaner || cleaner.status !== "ACTIVE")) {
      return { ok: false, message: "Choose an active cleaner." };
    }
    const property = data.properties.find(
      (item) => item.propertyId === input.propertyId && item.customerId === customer.customerId && item.status === "ACTIVE",
    );
    if (!property) return { ok: false, message: "Choose one of this customer's properties." };
    if (!isValidDate(input.date)) return { ok: false, message: "Choose a date." };
    if (!isValidLocalTime(input.arrivalWindowStart) || !isValidLocalTime(input.arrivalWindowEnd)) {
      return { ok: false, message: "Enter a valid arrival window." };
    }
    if (minutesFromTime(input.arrivalWindowEnd) <= minutesFromTime(input.arrivalWindowStart)) {
      return { ok: false, message: "The arrival window must end after it starts." };
    }
    if (
      !Number.isInteger(input.expectedDurationMinutes) ||
      input.expectedDurationMinutes < 30 ||
      input.expectedDurationMinutes > 12 * 60
    ) {
      return { ok: false, message: "Enter a duration between 30 minutes and 12 hours." };
    }
    if (!Number.isInteger(input.headcountNeeded) || input.headcountNeeded < 0 || input.headcountNeeded > 12) {
      return { ok: false, message: "Enter how many cleaners are needed." };
    }
    const activeAssignments = data.assignments.filter(
      (assignment) =>
        assignment.jobId === job.jobId &&
        cleanerIds.includes(assignment.cleanerId) &&
        assignment.status !== "CANCELED" &&
        assignment.status !== "EXPIRED_JOB_FILLED" &&
        assignment.status !== "DECLINED",
    );
    const covered = new Set(activeAssignments.map((assignment) => assignment.cleanerId));
    const crews = [
      ...activeAssignments.map((assignment) => assignment.confirmedCrewSize ?? assignment.pendingCrewSize ?? assignment.proposedCrewSize),
      ...(job.draftCleanerDetails ?? [])
        .filter((detail) => cleanerIds.includes(detail.cleanerId) && !covered.has(detail.cleanerId))
        .map((detail) => detail.proposedCrewSize),
    ];
    if (crews.some((size) => size > input.headcountNeeded)) {
      return { ok: false, message: "The headcount is smaller than a cleaner's crew on this cleaning." };
    }
    if (calculateConfirmedHeadcount(activeAssignments) > input.headcountNeeded) {
      return { ok: false, message: "The headcount is smaller than the people already confirmed." };
    }
    const dateChanged = input.date !== job.date;
    if (
      dateChanged &&
      job.seriesId &&
      data.jobs.some(
        (item) => item.seriesId === job.seriesId && item.jobId !== job.jobId && item.date === input.date && item.status !== "CANCELED",
      )
    ) {
      return { ok: false, message: "This schedule already has a cleaning on that date." };
    }
    const requestedArrivals = new Map((input.cleanerArrivals ?? []).map((arrival) => [arrival.cleanerId, arrival]));
    for (const arrival of requestedArrivals.values()) {
      if (!isValidLocalTime(arrival.arrivalWindowStart) || !isValidLocalTime(arrival.arrivalWindowEnd)) {
        return { ok: false, message: "Enter a valid arrival window." };
      }
      if (minutesFromTime(arrival.arrivalWindowEnd) <= minutesFromTime(arrival.arrivalWindowStart)) {
        return { ok: false, message: "The arrival window must end after it starts." };
      }
      const assignment = data.assignments.find(
        (item) =>
          item.jobId === job.jobId &&
          item.cleanerId === arrival.cleanerId &&
          item.status !== "CANCELED" &&
          item.status !== "EXPIRED_JOB_FILLED" &&
          item.status !== "DECLINED",
      );
      if (!assignment || assignment.status !== "CONFIRMED") continue;
      if (
        assignment.arrivalWindowStart === arrival.arrivalWindowStart &&
        assignment.arrivalWindowEnd === arrival.arrivalWindowEnd
      ) {
        continue;
      }
      const cleaner = data.cleaners.find((item) => item.cleanerId === assignment.cleanerId);
      if (!cleaner) return { ok: false, message: "That cleaner could not be found." };
      const weekStart = mondayOf(input.date);
      const submitted = data.submissions.some(
        (submission) => submission.cleanerId === cleaner.cleanerId && submission.weekStart === weekStart,
      );
      if (!submitted) return { ok: false, message: `${cleaner.firstName} has not submitted this week.` };
      const blocked = calculateBlockedRange({
        date: input.date,
        arrivalWindowStart: arrival.arrivalWindowStart,
        arrivalWindowEnd: arrival.arrivalWindowEnd,
        expectedDurationMinutes: assignment.expectedDurationMinutes,
      });
      const windows = data.availability
        .filter((window) => window.cleanerId === cleaner.cleanerId)
        .map((window) => ({ date: window.date, start: window.start, end: window.end }));
      if (!availabilityCoversBlockedRange(windows, blocked)) {
        return { ok: false, message: `This schedule is outside ${cleaner.firstName}'s submitted availability.` };
      }
      const conflict = detectConfirmedAssignmentConflict({
        cleanerId: cleaner.cleanerId,
        blocked,
        confirmedAssignments: data.assignments.filter((item) => item.status === "CONFIRMED").map(toAssignmentSchedule),
        ignoreAssignmentId: assignment.assignmentId,
      });
      if (conflict) return { ok: false, message: `This conflicts with another confirmed job for ${cleaner.firstName}.` };
    }
    const now = new Date().toISOString();
    const arrival = { start: input.arrivalWindowStart, end: input.arrivalWindowEnd };
    const selected = new Set(cleanerIds);
    const nextAssignments = data.assignments.map((item) => {
      if (item.jobId !== job.jobId) return item;
      const removed =
        !selected.has(item.cleanerId) && item.status !== "CANCELED" && item.status !== "EXPIRED_JOB_FILLED";
      if (removed) return { ...item, status: "CANCELED" as const, updatedAt: now };
      const tracksDate = item.status === "INVITED" || item.status === "CONFIRMED";
      const baseline = item.notifiedServiceDate ?? item.serviceDate;
      const needsReinvite = tracksDate && input.date !== baseline;
      const notifiedServiceDate = tracksDate ? baseline : item.notifiedServiceDate;
      const requested = requestedArrivals.get(item.cleanerId);
      const arrivalChanged = Boolean(
        requested &&
          (requested.arrivalWindowStart !== item.arrivalWindowStart || requested.arrivalWindowEnd !== item.arrivalWindowEnd),
      );
      const dateChangedForCleaner =
        item.serviceDate !== input.date ||
        Boolean(item.needsDateReinvite) !== needsReinvite ||
        item.notifiedServiceDate !== notifiedServiceDate;
      if (!dateChangedForCleaner && !arrivalChanged) return item;
      return {
        ...item,
        serviceDate: input.date,
        notifiedServiceDate,
        needsDateReinvite: needsReinvite ? true : undefined,
        arrivalWindowStart: requested?.arrivalWindowStart ?? item.arrivalWindowStart,
        arrivalWindowEnd: requested?.arrivalWindowEnd ?? item.arrivalWindowEnd,
        updatedAt: now,
      };
    });
    const stillOnJob = new Set(
      nextAssignments
        .filter(
          (item) =>
            item.jobId === job.jobId && item.status !== "CANCELED" && item.status !== "EXPIRED_JOB_FILLED",
        )
        .map((item) => item.cleanerId),
    );
    const draftCleanerIds = cleanerIds.filter((id) => !stillOnJob.has(id));
    setState({
      ...data,
      series:
        dateChanged && job.seriesId
          ? data.series.map((item) => {
              if (item.seriesId !== job.seriesId) return item;
              const skipped = new Set([...(item.skippedDates ?? []), job.date]);
              skipped.delete(input.date);
              return { ...item, skippedDates: [...skipped], updatedAt: now, updatedBy: "kelsey" };
            })
          : data.series,
      jobs: data.jobs.map((item) =>
        item.jobId === job.jobId
          ? {
              ...item,
              customerId: customer.customerId,
              date: input.date,
              propertyId: property.propertyId,
              serviceType: input.serviceType,
              arrivalWindowStart: arrival.start,
              arrivalWindowEnd: arrival.end,
              expectedDurationMinutes: input.expectedDurationMinutes,
              headcountNeeded: input.headcountNeeded,
              draftCleanerIds,
              draftCleanerDetails: (item.draftCleanerDetails ?? [])
                .filter((detail) => draftCleanerIds.includes(detail.cleanerId))
                .map((detail) => {
                  const requested = requestedArrivals.get(detail.cleanerId);
                  if (!requested) return detail;
                  return {
                    ...detail,
                    arrivalWindowStart: requested.arrivalWindowStart,
                    arrivalWindowEnd: requested.arrivalWindowEnd,
                  };
                }),
              snapshot: snapshotVisit(customer, property),
              specialInstructions: input.specialInstructions.trim(),
              updatedAt: now,
              updatedBy: "kelsey",
            }
          : item,
      ),
      assignments: nextAssignments,
    });
    return { ok: true, message: "Cleaning updated." };
  }

  function updateJob(input: UpdateJobInput): ActionResult {
    const job = data.jobs.find((item) => item.jobId === input.jobId);
    if (!job || job.status !== "SCHEDULED") return { ok: false, message: "That cleaning could not be edited." };
    const assignment = data.assignments.find(
      (item) => item.assignmentId === input.assignmentId && item.jobId === job.jobId,
    );
    if (!assignment) return { ok: false, message: "That cleaner assignment could not be found." };
    const cleaner = data.cleaners.find((item) => item.cleanerId === assignment.cleanerId);
    if (!cleaner) return { ok: false, message: "That cleaner could not be found." };
    const customer = data.customers.find((item) => item.customerId === job.customerId);
    if (!customer) return { ok: false, message: "That customer could not be found." };
    const property = data.properties.find(
      (item) => item.propertyId === input.propertyId && item.customerId === customer.customerId && item.status === "ACTIVE",
    );
    if (!property) return { ok: false, message: "Choose one of this customer's properties." };
    if (!isValidLocalTime(input.arrivalWindowStart) || !isValidLocalTime(input.arrivalWindowEnd)) {
      return { ok: false, message: "Enter a valid arrival window." };
    }
    if (minutesFromTime(input.arrivalWindowEnd) <= minutesFromTime(input.arrivalWindowStart)) {
      return { ok: false, message: "The arrival window must end after it starts." };
    }
    if (
      !Number.isInteger(input.expectedDurationMinutes) ||
      input.expectedDurationMinutes < 30 ||
      input.expectedDurationMinutes > 12 * 60
    ) {
      return { ok: false, message: "Enter a duration between 30 minutes and 12 hours." };
    }
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
    const others = data.assignments.filter(
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
      const submitted = data.submissions.some(
        (submission) => submission.cleanerId === cleaner.cleanerId && submission.weekStart === weekStart,
      );
      if (!submitted) return { ok: false, message: `${cleaner.firstName} has not submitted this week.` };
      const blocked = calculateBlockedRange({
        date: job.date,
        arrivalWindowStart: input.arrivalWindowStart,
        arrivalWindowEnd: input.arrivalWindowEnd,
        expectedDurationMinutes: input.expectedDurationMinutes,
      });
      const windows = data.availability
        .filter((window) => window.cleanerId === cleaner.cleanerId)
        .map((window) => ({ date: window.date, start: window.start, end: window.end }));
      if (!availabilityCoversBlockedRange(windows, blocked)) {
        return { ok: false, message: `This schedule is outside ${cleaner.firstName}'s submitted availability.` };
      }
      const conflict = detectConfirmedAssignmentConflict({
        cleanerId: cleaner.cleanerId,
        blocked,
        confirmedAssignments: data.assignments.filter((item) => item.status === "CONFIRMED").map(toAssignmentSchedule),
        ignoreAssignmentId: assignment.assignmentId,
      });
      if (conflict) {
        return { ok: false, message: `This conflicts with another confirmed job for ${cleaner.firstName}.` };
      }
    }
    const now = new Date().toISOString();
    const pay = confirmedCompensationCents({
      payType: input.payType,
      payPerPersonCents: input.payPerPersonCents,
      confirmedCrewSize: input.proposedCrewSize,
    });
    const nextAssignments = data.assignments.map((item) =>
      item.assignmentId === assignment.assignmentId
        ? {
            ...item,
            proposedCrewSize: input.proposedCrewSize,
            pendingCrewSize: item.status === "PENDING_AVAILABILITY" ? input.proposedCrewSize : item.pendingCrewSize,
            confirmedCrewSize: item.status === "CONFIRMED" ? input.proposedCrewSize : item.confirmedCrewSize,
            arrivalWindowStart: input.arrivalWindowStart,
            arrivalWindowEnd: input.arrivalWindowEnd,
            expectedDurationMinutes: input.expectedDurationMinutes,
            payType: input.payType,
            payPerPersonCents: input.payPerPersonCents,
            proposedTotalPayCents: pay,
            confirmedTotalPayCents: item.status === "CONFIRMED" ? pay : item.confirmedTotalPayCents,
            updatedAt: now,
          }
        : item,
    );
    const next = withEarliestArrival(
      {
        ...job,
        headcountNeeded: input.headcountNeeded,
        updatedAt: now,
        updatedBy: "kelsey",
      },
      nextAssignments,
    );
    setState({
      ...data,
      jobs: data.jobs.map((item) => (item.jobId === job.jobId ? next : item)),
      assignments: nextAssignments,
    });
    return { ok: true, message: "Assignment saved." };
  }

  function moveAssignmentTime(assignmentId: string, arrivalWindowStart: string, arrivalWindowEnd: string): ActionResult {
    const assignment = data.assignments.find((item) => item.assignmentId === assignmentId);
    if (
      !assignment ||
      assignment.status === "CANCELED" ||
      assignment.status === "DECLINED" ||
      assignment.status === "EXPIRED_JOB_FILLED"
    ) {
      return { ok: false, message: "That cleaning could not be moved." };
    }
    if (!isValidLocalTime(arrivalWindowStart) || !isValidLocalTime(arrivalWindowEnd)) {
      return { ok: false, message: "Enter a valid arrival window." };
    }
    if (minutesFromTime(arrivalWindowEnd) <= minutesFromTime(arrivalWindowStart)) {
      return { ok: false, message: "The arrival window must end after it starts." };
    }
    const job = data.jobs.find((item) => item.jobId === assignment.jobId);
    if (!job || job.status === "CANCELED") return { ok: false, message: "That cleaning could not be moved." };
    const cleaner = data.cleaners.find((item) => item.cleanerId === assignment.cleanerId);
    if (!cleaner) return { ok: false, message: "That cleaner could not be found." };
    if (assignment.status === "CONFIRMED") {
      const weekStart = mondayOf(assignment.serviceDate);
      const submitted = data.submissions.some(
        (submission) => submission.cleanerId === cleaner.cleanerId && submission.weekStart === weekStart,
      );
      if (!submitted) return { ok: false, message: `${cleaner.firstName} has not submitted this week.` };
      const blocked = calculateBlockedRange({
        date: assignment.serviceDate,
        arrivalWindowStart,
        arrivalWindowEnd,
        expectedDurationMinutes: assignment.expectedDurationMinutes,
      });
      const windows = data.availability
        .filter((window) => window.cleanerId === cleaner.cleanerId)
        .map((window) => ({ date: window.date, start: window.start, end: window.end }));
      if (!availabilityCoversBlockedRange(windows, blocked)) {
        return { ok: false, message: `This schedule is outside ${cleaner.firstName}'s submitted availability.` };
      }
      const conflict = detectConfirmedAssignmentConflict({
        cleanerId: cleaner.cleanerId,
        blocked,
        confirmedAssignments: data.assignments.filter((item) => item.status === "CONFIRMED").map(toAssignmentSchedule),
        ignoreAssignmentId: assignment.assignmentId,
      });
      if (conflict) return { ok: false, message: `This conflicts with another confirmed job for ${cleaner.firstName}.` };
    }
    const now = new Date().toISOString();
    setState({
      ...data,
      assignments: data.assignments.map((item) =>
        item.assignmentId === assignment.assignmentId
          ? { ...item, arrivalWindowStart, arrivalWindowEnd, updatedAt: now }
          : item,
      ),
    });
    return { ok: true };
  }

  function deleteJob(jobId: string): ActionResult {
    const job = data.jobs.find((item) => item.jobId === jobId);
    if (!job) return { ok: false, message: "That cleaning could not be deleted." };
    const now = new Date().toISOString();
    setState({
      ...data,
      series: job.seriesId
        ? data.series.map((item) =>
            item.seriesId === job.seriesId
              ? {
                  ...item,
                  skippedDates: [...new Set([...(item.skippedDates ?? []), job.date])],
                  updatedAt: now,
                  updatedBy: "kelsey",
                }
              : item,
          )
        : data.series,
      jobs: data.jobs.filter((item) => item.jobId !== job.jobId),
      assignments: data.assignments.filter((item) => item.jobId !== job.jobId),
    });
    return { ok: true, message: "Cleaning deleted." };
  }

  function deleteSeries(seriesId: string): ActionResult {
    const series = data.series.find((item) => item.seriesId === seriesId);
    if (!series) return { ok: false, message: "That recurring schedule could not be deleted." };
    const removedJobIds = new Set(
      data.jobs.filter((job) => job.seriesId === series.seriesId && job.date >= data.today).map((job) => job.jobId),
    );
    setState({
      ...data,
      series: data.series.filter((item) => item.seriesId !== series.seriesId),
      jobs: data.jobs.filter((job) => !removedJobIds.has(job.jobId)),
      assignments: data.assignments.filter((assignment) => !removedJobIds.has(assignment.jobId)),
    });
    return { ok: true, message: "Recurring schedule deleted." };
  }

  const value: HubContextValue = {
    ...data,
    ready: true,
    flash: (message) => setToast(message),
    enterAdmin: () => setState({ ...data, role: "ADMIN", cleanerId: null }),
    enterCleaner: (cleanerId) => setState({ ...data, role: "CLEANER", cleanerId }),
    signOut: () => setState({ ...data, role: null, cleanerId: null }),
    acceptInvitation,
    declineInvitation,
    submitAvailability,
    saveCustomer,
    saveSeries,
    updateCleanerAdmin,
    createJob,
    saveCleanerDetails,
    staffCleaner,
    completeAssignment,
    addJobCleaner,
    removeJobCleaner,
    updateVisit,
    updateJob,
    moveAssignmentTime,
    deleteJob,
    deleteSeries,
  };

  return (
    <HubContext.Provider value={value}>
      {children}
      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-5">
          <p role="status" className="rounded-full bg-mint px-4 py-2 text-sm font-medium text-ink shadow-[0_8px_24px_rgba(51,51,51,0.12)]">
            {toast}
          </p>
        </div>
      ) : null}
    </HubContext.Provider>
  );
}

export function useHub(): HubContextValue {
  const value = useContext(HubContext);
  if (!value) throw new Error("useHub must be used within HubProvider");
  return value;
}

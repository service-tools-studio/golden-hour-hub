"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { deriveCrewSettings } from "@/lib/domain/cleaners";
import { validateCustomerInput, type CustomerInput } from "@/lib/domain/customers";
import {
  expireRemainingInvitationsWhenFilled,
  validateInvitationAcceptance,
  withAssignmentConfirmed,
  withAssignmentDeclined,
} from "@/lib/domain/invitations";
import { dateMatchesRule, validateRecurrenceRule } from "@/lib/domain/recurrence";
import { toAssignmentSchedule, validateAvailabilityEdit } from "@/lib/domain/scheduling";
import { addDays, todayInBusinessZone } from "@/lib/domain/time";
import { buildSeed, type HubData } from "@/lib/mock/seed";
import type {
  AppRole,
  AvailabilityWindow,
  CleanerStatus,
  Customer,
  Property,
  RecurrenceRule,
  SeriesStatus,
} from "@/lib/domain/types";

const STORAGE_KEY = "ghh-preview-v1";

type HubState = HubData & {
  role: AppRole | null;
  cleanerId: string | null;
};

type ActionResult = { ok: true; message?: string; customerId?: string } | { ok: false; message: string };

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
    input: { helpersApproved: boolean; typicalHelperCount: number; status: CleanerStatus },
  ) => ActionResult;
};

const HubContext = createContext<HubContextValue | null>(null);

function createState(): HubState {
  const today = todayInBusinessZone();
  return { ...buildSeed(today), role: null, cleanerId: null };
}

export function HubProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<HubState | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setState(createState());
        return;
      }
      const parsed = JSON.parse(raw) as HubState;
      if (!parsed.cleaners || !parsed.jobs || !parsed.assignments || !parsed.properties) {
        setState(createState());
        return;
      }
      setState({ ...parsed, today: todayInBusinessZone() });
    } catch {
      setState(createState());
    }
  }, []);

  useEffect(() => {
    if (!state) return;
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
    });
    if (!decision.ok) return decision;
    const now = new Date().toISOString();
    const settled = expireRemainingInvitationsWhenFilled(
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
      assignments: [...data.assignments.filter((item) => item.jobId !== job.jobId), ...settled],
    });
    return { ok: true };
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
      ...windows,
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
    setState({
      ...data,
      availability: combined,
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
    input: { helpersApproved: boolean; typicalHelperCount: number; status: CleanerStatus },
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
              helpersApproved: crew.helpersApproved,
              typicalHelperCount: crew.typicalHelperCount,
              typicalCrewSize: crew.typicalCrewSize,
              updatedAt: now,
              updatedBy: "kelsey",
            }
          : cleaner,
      ),
    });
    return { ok: true };
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

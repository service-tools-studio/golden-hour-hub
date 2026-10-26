"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { HubRemoteSyncBlockerProvider } from "@/components/hub-sync";
import { usePathname } from "next/navigation";
import {
  acceptInvitationAction,
  declineInvitationAction,
  submitAvailabilityAction,
} from "@/app/actions/cleaner-hub";
import { ManualCleanerTextPrompt } from "@/components/admin/manual-cleaner-text-prompt";
import { PreviewModeBanner } from "@/components/preview-mode-banner";
import {
  queueSchedulingSmsDelivery,
  type ManualCleanerTextPrompt as ManualCleanerTextOffer,
} from "@/lib/cleaner/deliver-scheduling-sms";
import { bootstrapHub, persistAdminHub } from "@/app/actions/hub-data";
import { hubDataForCleaner } from "@/lib/auth/hub-scope";
import { previewAuthAllowed } from "@/lib/auth/preview-mode";
import { SIGNED_OUT_STORAGE_KEY } from "@/lib/auth/signed-out-guard";
import { mergeAdjacentWindows } from "@/lib/domain/availability";
import { confirmedCompensationCents } from "@/lib/domain/compensation";
import { deriveCrewSettings, validateProposedCrewSize } from "@/lib/domain/cleaners";
import {
  findCustomerByExactName,
  snapshotVisit,
  validateCustomerInput,
  type CustomerInput,
} from "@/lib/domain/customers";
import {
  expireJobInvitesIfHeadcountMet,
  expireRemainingInvitationsWhenFilled,
  revalidatePendingAssignments,
  validateInvitationAcceptance,
  withAssignmentConfirmed,
  withAssignmentDeclined,
} from "@/lib/domain/invitations";
import { normalizeArrivalWindow, validateArrivalWindow } from "@/lib/domain/arrival";
import {
  dateMatchesRule,
  mergeRecurringHorizon,
  planOccurrenceStaffing,
  removeStaleSeriesOccurrences,
  seriesScheduleChanged,
  validateRecurrenceRule,
} from "@/lib/domain/recurrence";
import {
  availabilityCoversBlockedRange,
  calculateBlockedRange,
  calculateConfirmedHeadcount,
  CLEANING_DELETE_BLOCKED_MESSAGE,
  jobHasCleanerBlockingDeletion,
  applyScheduleConflictWarning,
  detectConfirmedAssignmentConflict,
  isConfirmedScheduleConflictReason,
  reconcileScheduleConflictWarnings,
  toAssignmentSchedule,
  validateAvailabilityEdit,
} from "@/lib/domain/scheduling";
import { addDays, dayOfWeek, isValidDate, isValidLocalTime, minutesFromTime, mondayOf, todayInBusinessZone } from "@/lib/domain/time";
import { emptyHub, type HubData } from "@/lib/mock/seed";
import type {
  AppRole,
  AvailabilityWindow,
  CleanerProfile,
  CleanerStatus,
  Customer,
  AssignmentNotice,
  Job,
  JobAssignment,
  PayType,
  Property,
  RecurrenceRule,
  RecurringSeries,
  SeriesStatus,
  ServiceType,
} from "@/lib/domain/types";

const STORAGE_KEY = "ghh-preview-v2";
const SESSION_KEY = "ghh-session-v2";
/** Background refresh while the tab is visible (admin ↔ cleaner, multiple tabs). */
const REMOTE_SYNC_INTERVAL_MS = 20_000;

type HubState = HubData & {
  role: AppRole | null;
  cleanerId: string | null;
};

type ActionResult =
  | { ok: true; message?: string; customerId?: string; jobId?: string }
  | { ok: false; message: string };
type AsyncActionResult = Promise<ActionResult>;

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
  pricePerVisitCents?: number;
  recurringSchedule?: { interval: 1 | 2 | 4 };
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
  pricePerVisitCents?: number;
  recurringSchedule?: { interval: 1 | 2 | 4 };
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
  /** True when AUTH_SESSION_SECRET is unset (browser role picker at /). */
  previewAuth: boolean;
  flash: (message: string) => void;
  /** Toast plus spinner until {@link clearActionLoading} (e.g. while navigating after an action). */
  flashLoading: (message: string) => void;
  clearActionLoading: () => void;
  queueSchedulingSms: (
    promise: Promise<{ toast: string; manual?: ManualCleanerTextOffer }>,
    fallbackSavedMessage?: string,
  ) => void;
  showManualCleanerText: (prompt: ManualCleanerTextOffer) => void;
  dismissManualCleanerText: () => void;
  enterAdmin: () => void;
  enterCleaner: (cleanerId: string) => void;
  signOut: () => Promise<void>;
  acceptInvitation: (assignmentId: string, crewSize: number) => AsyncActionResult;
  declineInvitation: (assignmentId: string) => AsyncActionResult;
  submitAvailability: (
    cleanerId: string,
    weekStart: string,
    windows: AvailabilityWindow[],
    options?: { quiet?: boolean },
  ) => AsyncActionResult;
  saveCustomer: (input: CustomerInput, customerId?: string) => ActionResult;
  deleteCustomer: (customerId: string) => ActionResult;
  saveSeries: (
    seriesId: string,
    input: {
      propertyId: string;
      recurrence: RecurrenceRule;
      defaultHeadcountNeeded: number;
      defaultPricePerVisitCents?: number;
      status: SeriesStatus;
    },
  ) => ActionResult;
  updateCleanerAdmin: (
    cleanerId: string,
    input: {
      typicalHelperCount: number;
      maxHelperCount: number;
      typicalHourlyRateCents: number;
      status: CleanerStatus;
    },
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
  markAssignmentNotified: (assignmentId: string) => ActionResult;
  deleteJob: (jobId: string) => ActionResult;
  deleteSeries: (seriesId: string) => ActionResult;
  /** Extend recurring job occurrences through the current horizon (safe to call often). */
  refreshRecurringHorizon: () => void;
  applyCleanerSmsConsent: (input: {
    smsSchedulingOptIn: boolean;
    smsOptInRecordedAt: string;
    mobilePhone?: string;
    smsConsentPhone?: string;
    smsConsentRecordedAt?: string;
    smsConsentDisclosureVersion?: string;
    smsConsentMethod?: string;
  }) => void;
  undoDeleteJob: () => ActionResult;
  undoDeleteCustomer: () => ActionResult;
};

type DeletedJobSnapshot = {
  job: Job;
  assignments: JobAssignment[];
  seriesSkippedDatesBefore?: { seriesId: string; skippedDates: string[] };
};

type DeletedCustomerSnapshot = {
  customer: Customer;
  properties: Property[];
};

const HubContext = createContext<HubContextValue | null>(null);

function validatePricePerVisitCents(cents?: number): ActionResult | null {
  if (cents === undefined) return null;
  if (!Number.isInteger(cents) || cents < 0) {
    return { ok: false, message: "Enter a valid price per visit." };
  }
  return null;
}

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

function jobWithCleaningArrival(job: Job, arrivalWindowStart: string, arrivalWindowEnd: string, now: string): Job {
  return {
    ...job,
    arrivalWindowStart,
    arrivalWindowEnd,
    updatedAt: now,
    updatedBy: "kelsey",
  };
}

function syncJobAssignmentsToCleaningArrival(
  assignments: JobAssignment[],
  jobId: string,
  arrivalWindowStart: string,
  arrivalWindowEnd: string,
  now: string,
): JobAssignment[] {
  return assignments.map((item) => {
    if (item.jobId !== jobId) return item;
    if (item.status === "CANCELED" || item.status === "EXPIRED_JOB_FILLED") return item;
    if (item.arrivalWindowStart === arrivalWindowStart && item.arrivalWindowEnd === arrivalWindowEnd) return item;
    return { ...item, arrivalWindowStart, arrivalWindowEnd, updatedAt: now };
  });
}

function withReconciledScheduleConflicts(state: HubState): HubState {
  return {
    ...state,
    assignments: reconcileScheduleConflictWarnings(state.assignments, state.cleaners),
  };
}

function assignmentSavedMessage(
  cleaner: CleanerProfile,
  assignment: Pick<JobAssignment, "status" | "attentionReason">,
  mode: "INVITE" | "DIRECT",
): string {
  if (assignment.status === "NEEDS_ATTENTION" && isConfirmedScheduleConflictReason(assignment.attentionReason)) {
    return `Assigned to ${cleaner.firstName}. Resolve the schedule conflict on this cleaning.`;
  }
  if (assignment.status === "CONFIRMED") return "Cleaning assigned.";
  if (assignment.status === "INVITED") return "Invitation sent.";
  if (assignment.status === "PENDING_AVAILABILITY" && mode === "DIRECT") return "Cleaning assigned.";
  return `Saved. Waiting for ${cleaner.firstName} to confirm.`;
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
    const cleaners = parsed.cleaners.map((cleaner) => ({
      ...cleaner,
      typicalHourlyRateCents:
        typeof cleaner.typicalHourlyRateCents === "number" && cleaner.typicalHourlyRateCents >= 0
          ? cleaner.typicalHourlyRateCents
          : 3000,
    }));
    return {
      ...withCurrentHorizon({ ...parsed, cleaners }),
      role: parsed.role ?? null,
      cleanerId: parsed.cleanerId ?? null,
    };
  } catch {
    return createState();
  }
}

function createState(): HubState {
  const today = todayInBusinessZone();
  return { ...emptyHub(today), role: null, cleanerId: null };
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

function sortedHubSnapshot(hub: HubData): string {
  const by = <T,>(items: T[], key: keyof T) =>
    [...items].sort((left, right) => String(left[key]).localeCompare(String(right[key])));
  return JSON.stringify({
    today: hub.today,
    cleaners: by(hub.cleaners, "cleanerId"),
    customers: by(hub.customers, "customerId"),
    properties: by(hub.properties, "propertyId"),
    series: by(hub.series, "seriesId"),
    jobs: by(hub.jobs, "jobId"),
    assignments: by(hub.assignments, "assignmentId"),
    availability: by(hub.availability, "date"),
    submissions: by(hub.submissions, "weekStart"),
  });
}

function hubEntitySnapshot(state: HubState): string {
  return sortedHubSnapshot(state);
}

type InitialAuth = { role: AppRole; cleanerId: string | null };

export function HubProvider({
  children,
  initialAuth = null,
  initialPreviewAuth = false,
}: {
  children: React.ReactNode;
  initialAuth?: InitialAuth | null;
  /** Server-known preview mode (no AUTH_SESSION_SECRET, non-production). */
  initialPreviewAuth?: boolean;
}) {
  const [state, setStateInner] = useState<HubState | null>(() => {
    if (!initialAuth?.role) return null;
    const today = todayInBusinessZone();
    return { ...emptyHub(today), role: initialAuth.role, cleanerId: initialAuth.cleanerId };
  });
  const setState = useCallback((update: HubState | null | ((prev: HubState | null) => HubState | null)) => {
    setStateInner((prev) => {
      const resolved = typeof update === "function" ? update(prev) : update;
      if (!resolved) return resolved;
      return withReconciledScheduleConflicts(resolved);
    });
  }, []);
  const [toast, setToast] = useState<string | null>(null);
  const [notificationPending, setNotificationPending] = useState(0);
  const [actionLoading, setActionLoading] = useState(0);
  const pathname = usePathname();
  const [manualCleanerText, setManualCleanerText] = useState<ManualCleanerTextOffer | null>(null);
  const [deletedJobUndo, setDeletedJobUndo] = useState<DeletedJobSnapshot | null>(null);
  const deletedJobUndoTimerRef = useRef<number | null>(null);
  const [deletedCustomerUndo, setDeletedCustomerUndo] = useState<DeletedCustomerSnapshot | null>(null);
  const deletedCustomerUndoTimerRef = useRef<number | null>(null);
  const [previewAuth, setPreviewAuth] = useState(initialPreviewAuth && previewAuthAllowed());
  const [ready, setReady] = useState(false);
  const [hubDataSource, setHubDataSource] = useState<"preview" | "dynamodb" | null>(null);
  const sourceRef = useRef<"preview" | "dynamodb" | null>(null);
  const bootstrappedRef = useRef(false);
  /** Full hub from Dynamo when using preview auth (role picker without Cognito session). */
  const previewDynamoHubRef = useRef<HubData | null>(null);
  const persistQueueRef = useRef<HubData | null>(null);
  const persistRunningRef = useRef(false);
  const syncBlockersRef = useRef(new Set<() => boolean>());
  const syncInFlightRef = useRef(false);
  const hubRevisionRef = useRef<number | null>(null);
  const skipPersistForRemoteSyncRef = useRef(false);
  const actionLoadingRef = useRef(0);
  const previewAuthRef = useRef(previewAuth);
  const stateRef = useRef<HubState | null>(null);
  previewAuthRef.current = previewAuth;
  actionLoadingRef.current = actionLoading;

  const registerRemoteSyncBlocker = useCallback((check: () => boolean) => {
    syncBlockersRef.current.add(check);
    return () => {
      syncBlockersRef.current.delete(check);
    };
  }, []);

  function remoteSyncBlocked(): boolean {
    for (const check of syncBlockersRef.current) {
      if (check()) return true;
    }
    if (persistRunningRef.current) return true;
    if (actionLoadingRef.current > 0) return true;
    return false;
  }

  const syncFromServer = useCallback(async () => {
    if (!bootstrappedRef.current || hubDataSource !== "dynamodb") return;
    if (syncInFlightRef.current || remoteSyncBlocked()) return;
    syncInFlightRef.current = true;
    try {
      const versionResponse = await fetch("/api/hub/version", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!versionResponse.ok) return;
      const versionBody = (await versionResponse.json()) as
        | { ok: false; message: string }
        | { source: "preview" }
        | { revision: number };
      if ("ok" in versionBody || "source" in versionBody) return;
      const serverRevision = versionBody.revision;
      if (hubRevisionRef.current !== null && hubRevisionRef.current === serverRevision) return;
      if (remoteSyncBlocked()) return;

      const response = await fetch("/api/hub/sync", { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) return;
      const remote = (await response.json()) as
        | { ok: false; message: string }
        | { source: "preview" }
        | { source: "dynamodb"; data: HubData; revision: number };
      if ("ok" in remote || remote.source !== "dynamodb") return;
      if (remoteSyncBlocked()) return;
      const prev = stateRef.current;
      if (!prev?.role) return;
      const previewPick = previewAuthRef.current;
      if (previewPick) previewDynamoHubRef.current = remote.data;
      let hubPayload = remote.data;
      if (previewPick && prev.role === "CLEANER" && prev.cleanerId) {
        hubPayload = hubDataForCleaner(remote.data, prev.cleanerId);
      }
      hubRevisionRef.current = remote.revision;
      if (sortedHubSnapshot(prev) === sortedHubSnapshot(hubPayload)) return;
      const next = { ...withCurrentHorizon(hubPayload), role: prev.role, cleanerId: prev.cleanerId };
      skipPersistForRemoteSyncRef.current = true;
      setState(next);
    } catch (error) {
      console.error("Remote hub sync failed.", error);
    } finally {
      syncInFlightRef.current = false;
    }
  }, [hubDataSource]);

  async function drainPersistQueue() {
    if (persistRunningRef.current) return;
    persistRunningRef.current = true;
    try {
      while (persistQueueRef.current) {
        const payload = persistQueueRef.current;
        persistQueueRef.current = null;
        const result = await persistAdminHub(payload);
        if (!result.ok) {
          setToast(result.message);
        } else {
          hubRevisionRef.current = result.revision;
        }
      }
    } finally {
      persistRunningRef.current = false;
      if (persistQueueRef.current) void drainPersistQueue();
    }
  }

  useEffect(() => {
    setActionLoading(0);
  }, [pathname]);

  useEffect(() => {
    if (!toast || actionLoading > 0) return;
    const duration = toast.length > 80 ? 8000 : 2400;
    const timer = window.setTimeout(() => setToast(null), duration);
    return () => window.clearTimeout(timer);
  }, [toast, actionLoading]);

  useEffect(() => {
    let cancelled = false;
    async function loadAuthSession(): Promise<{
      role: AppRole | null;
      cleanerId: string | null;
      preview: boolean;
    }> {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
        const data = (await response.json()) as {
          configured?: boolean;
          preview?: boolean;
          session?: { role: AppRole; cleanerId: string | null } | null;
        };
        if (data.preview && previewAuthAllowed()) {
          const picked = readSession();
          return { role: picked.role, cleanerId: picked.cleanerId, preview: true };
        }
        if (!data.configured) {
          if (!previewAuthAllowed()) return { role: null, cleanerId: null, preview: false };
          const picked = readSession();
          const preview = Boolean(data.preview) || initialPreviewAuth;
          return { ...picked, preview };
        }
        if (!data.session) return { role: null, cleanerId: null, preview: false };
        return { role: data.session.role, cleanerId: data.session.cleanerId, preview: false };
      } catch {
        return { role: null, cleanerId: null, preview: false };
      }
    }
    async function load() {
      const auth = await loadAuthSession();
      if (!cancelled) {
        setPreviewAuth(auth.preview || (initialPreviewAuth && previewAuthAllowed()));
      }
      if (cancelled) return;

      if (!auth.preview && !auth.role) {
        const today = todayInBusinessZone();
        sourceRef.current = null;
        bootstrappedRef.current = false;
        setHubDataSource(null);
        setState({ ...emptyHub(today), role: null, cleanerId: null });
        setReady(true);
        const path = window.location.pathname;
        if (path.startsWith("/admin") || path.startsWith("/cleaner")) {
          window.location.replace("/login");
        }
        return;
      }

      try {
        const remote = await bootstrapHub();
        if (cancelled) return;
        if ("ok" in remote) {
          const today = todayInBusinessZone();
          sourceRef.current = null;
          bootstrappedRef.current = false;
          setHubDataSource(null);
          setState({ ...emptyHub(today), role: null, cleanerId: null });
          setReady(true);
          return;
        }
        if (remote.source === "dynamodb") {
          sourceRef.current = "dynamodb";
          setHubDataSource("dynamodb");
          const previewPick = auth.preview || (initialPreviewAuth && previewAuthAllowed());
          if (previewPick) {
            previewDynamoHubRef.current = remote.data;
          } else {
            previewDynamoHubRef.current = null;
          }
          const role = previewPick ? auth.role : (auth.role ?? initialAuth?.role ?? null);
          const cleanerId = previewPick ? auth.cleanerId : (auth.cleanerId ?? initialAuth?.cleanerId ?? null);
          let hubPayload = remote.data;
          if (previewPick && role === "CLEANER" && cleanerId) {
            hubPayload = hubDataForCleaner(remote.data, cleanerId);
          }
          hubRevisionRef.current = remote.revision;
          bootstrappedRef.current = true;
          setState({
            ...withCurrentHorizon(hubPayload),
            role,
            cleanerId,
          });
          setReady(true);
          return;
        }
        sourceRef.current = "preview";
        setHubDataSource("preview");
        bootstrappedRef.current = true;
        const preview = readPreview();
        setState({
          ...preview,
          role: auth.preview ? auth.role : (auth.role ?? initialAuth?.role ?? preview.role),
          cleanerId: auth.preview ? auth.cleanerId : (auth.cleanerId ?? initialAuth?.cleanerId ?? preview.cleanerId),
        });
        setReady(true);
      } catch (error) {
        console.error("Failed to load hub data.", error);
        if (cancelled) return;
        const today = todayInBusinessZone();
        setState((current) =>
          current ?? {
            ...emptyHub(today),
            role: auth.role ?? initialAuth?.role ?? null,
            cleanerId: auth.cleanerId ?? initialAuth?.cleanerId ?? null,
          },
        );
        setReady(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [initialAuth?.role, initialAuth?.cleanerId, initialPreviewAuth]);

  useEffect(() => {
    if (!ready || hubDataSource !== "dynamodb") return;
    let visibilityTimer: number | undefined;
    let interval: number | undefined;
    function scheduleSync() {
      window.clearTimeout(visibilityTimer);
      visibilityTimer = window.setTimeout(() => {
        void syncFromServer();
      }, 300);
    }
    function startPolling() {
      if (interval !== undefined) return;
      interval = window.setInterval(() => {
        void syncFromServer();
      }, REMOTE_SYNC_INTERVAL_MS);
    }
    function stopPolling() {
      if (interval === undefined) return;
      window.clearInterval(interval);
      interval = undefined;
    }
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        scheduleSync();
        startPolling();
        return;
      }
      window.clearTimeout(visibilityTimer);
      stopPolling();
    }
    function onWindowFocus() {
      if (document.visibilityState !== "visible") return;
      scheduleSync();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onWindowFocus);
    if (document.visibilityState === "visible") {
      scheduleSync();
      startPolling();
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onWindowFocus);
      window.clearTimeout(visibilityTimer);
      stopPolling();
    };
  }, [ready, hubDataSource, syncFromServer]);

  useEffect(() => {
    if (!state || !sourceRef.current || !bootstrappedRef.current) return;
    if (sourceRef.current === "dynamodb") {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ role: state.role, cleanerId: state.cleanerId }));
      if (skipPersistForRemoteSyncRef.current) {
        skipPersistForRemoteSyncRef.current = false;
        return;
      }
      if (state.role === "ADMIN") {
        persistQueueRef.current = {
          today: state.today,
          cleaners: state.cleaners,
          customers: state.customers,
          properties: state.properties,
          series: state.series,
          jobs: state.jobs,
          assignments: state.assignments,
          availability: state.availability,
          submissions: state.submissions,
        };
        void drainPersistQueue();
      }
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  if (!state) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-cream px-5 text-sm text-ink/60">
        Loading…
      </div>
    );
  }

  stateRef.current = state;
  const data = state;

  async function acceptInvitation(assignmentId: string, crewSize: number): AsyncActionResult {
    if (!data.cleanerId) return { ok: false, message: "This invitation belongs to someone else." };
    if (sourceRef.current === "dynamodb" && data.role === "CLEANER") {
      const remote = await acceptInvitationAction(assignmentId, crewSize);
      if (!remote.ok) return remote;
      setState({ ...remote.data, role: data.role, cleanerId: data.cleanerId });
      return { ok: true };
    }
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
    });
    if (!decision.ok) return decision;
    const now = new Date().toISOString();
    const updated = expireRemainingInvitationsWhenFilled(
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
    let assignments = [...data.assignments.filter((item) => item.jobId !== job.jobId), ...updated];
    const submitted = data.submissions.some(
      (submission) => submission.cleanerId === cleaner.cleanerId && submission.weekStart === weekStart,
    );
    if (submitted) {
      assignments = revalidatePendingAssignments({
        assignments,
        cleaner,
        weekStart,
        weekEnd: addDays(weekStart, 6),
        windows: data.availability
          .filter((window) => window.cleanerId === cleaner.cleanerId)
          .map((window) => ({ date: window.date, start: window.start, end: window.end })),
        jobs: data.jobs,
        nowIso: now,
      });
    }
    setState({
      ...data,
      assignments,
    });
    return { ok: true };
  }

  async function declineInvitation(assignmentId: string): AsyncActionResult {
    if (!data.cleanerId) return { ok: false, message: "This invitation belongs to someone else." };
    if (sourceRef.current === "dynamodb" && data.role === "CLEANER") {
      const remote = await declineInvitationAction(assignmentId);
      if (!remote.ok) return remote;
      setState({ ...remote.data, role: data.role, cleanerId: data.cleanerId });
      return { ok: true };
    }
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

  async function submitAvailability(
    cleanerId: string,
    weekStart: string,
    windows: AvailabilityWindow[],
    options?: { quiet?: boolean },
  ): AsyncActionResult {
    const toastMessage = "Availability submitted.";
    if (sourceRef.current === "dynamodb" && data.role === "CLEANER") {
      if (data.cleanerId !== cleanerId) {
        return { ok: false, message: "You can only edit your own availability." };
      }
      const remote = await submitAvailabilityAction(weekStart, windows);
      if (!remote.ok) return remote;
      setState({ ...remote.data, role: data.role, cleanerId: data.cleanerId });
      if (!options?.quiet) setToast(toastMessage);
      return { ok: true, message: remote.message };
    }
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
    if (!options?.quiet) setToast(toastMessage);
    return { ok: true, message: toastMessage };
  }

  function saveCustomer(input: CustomerInput, customerId?: string): ActionResult {
    const decision = validateCustomerInput(input);
    if (!decision.ok) return decision;
    const nameCollision = findCustomerByExactName(
      data.customers,
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
        unit: item.unit,
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

  function clearDeletedCustomerUndo() {
    if (deletedCustomerUndoTimerRef.current !== null) {
      window.clearTimeout(deletedCustomerUndoTimerRef.current);
      deletedCustomerUndoTimerRef.current = null;
    }
    setDeletedCustomerUndo(null);
  }

  function scheduleDeletedCustomerUndo(snapshot: DeletedCustomerSnapshot) {
    clearDeletedJobUndo();
    clearDeletedCustomerUndo();
    setDeletedCustomerUndo(snapshot);
    deletedCustomerUndoTimerRef.current = window.setTimeout(() => clearDeletedCustomerUndo(), 8000);
  }

  function undoDeleteCustomer(): ActionResult {
    if (!deletedCustomerUndo) return { ok: false, message: "That customer could not be restored." };
    const { customer, properties } = deletedCustomerUndo;
    clearDeletedCustomerUndo();
    setState({
      ...data,
      customers: [...data.customers, customer].sort(
        (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName),
      ),
      properties: [...data.properties, ...properties],
    });
    return { ok: true, message: "Customer restored." };
  }

  function deleteCustomer(customerId: string): ActionResult {
    const customer = data.customers.find((item) => item.customerId === customerId);
    if (!customer) return { ok: false, message: "That customer could not be found." };
    if (data.jobs.some((job) => job.customerId === customerId)) {
      return { ok: false, message: "Remove or reassign this customer's cleanings before deleting them." };
    }
    if (data.series.some((series) => series.customerId === customerId)) {
      return { ok: false, message: "Delete this customer's recurring schedules before deleting them." };
    }
    const snapshot: DeletedCustomerSnapshot = {
      customer,
      properties: data.properties.filter((item) => item.customerId === customerId),
    };
    setState({
      ...data,
      customers: data.customers.filter((item) => item.customerId !== customerId),
      properties: data.properties.filter((item) => item.customerId !== customerId),
    });
    scheduleDeletedCustomerUndo(snapshot);
    return { ok: true, message: "Customer deleted." };
  }

  function saveSeries(
    seriesId: string,
    input: {
      propertyId: string;
      recurrence: RecurrenceRule;
      defaultHeadcountNeeded: number;
      defaultPricePerVisitCents?: number;
      status: SeriesStatus;
    },
  ): ActionResult {
    const priceCheck = validatePricePerVisitCents(input.defaultPricePerVisitCents);
    if (priceCheck && !priceCheck.ok) return priceCheck;
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
    const nextSeries = data.series.map((item) =>
      item.seriesId === seriesId
        ? {
            ...item,
            propertyId: input.propertyId,
            recurrence: input.recurrence,
            defaultHeadcountNeeded: input.defaultHeadcountNeeded,
            defaultPricePerVisitCents: input.defaultPricePerVisitCents,
            status: input.status,
            startDate,
            updatedAt: now,
            updatedBy: "kelsey",
          }
        : item,
    );
    const updated = nextSeries.find((item) => item.seriesId === seriesId)!;
    let jobs = data.jobs;
    let assignments = data.assignments;
    if (seriesScheduleChanged(series, updated)) {
      const pruned = removeStaleSeriesOccurrences({
        today: data.today,
        series: updated,
        jobs,
        assignments,
      });
      jobs = pruned.jobs;
      assignments = pruned.assignments;
    }
    const base = { ...data, series: nextSeries, jobs, assignments };
    const generated = mergeRecurringHorizon({
      ...base,
      today: data.today,
      nowIso: now,
    });
    setState({
      ...base,
      series: generated.series,
      jobs: generated.jobs,
      assignments: generated.assignments,
    });
    return { ok: true };
  }

  function updateCleanerAdmin(
    cleanerId: string,
    input: {
      typicalHelperCount: number;
      maxHelperCount: number;
      typicalHourlyRateCents: number;
      status: CleanerStatus;
    },
  ): ActionResult {
    const crew = deriveCrewSettings(input);
    if (!crew.ok) return crew;
    if (!Number.isInteger(input.typicalHourlyRateCents) || input.typicalHourlyRateCents < 0) {
      return { ok: false, message: "Enter a valid hourly rate." };
    }
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
              typicalHourlyRateCents: input.typicalHourlyRateCents,
              updatedAt: now,
              updatedBy: "kelsey",
            }
          : cleaner,
      ),
    });
    return { ok: true };
  }

  function createJob(input: CreateJobInput): ActionResult {
    const priceCheck = validatePricePerVisitCents(input.pricePerVisitCents);
    if (priceCheck && !priceCheck.ok) return priceCheck;
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
    const arrivalTimes = validateArrivalWindow(input.arrivalWindowStart, input.arrivalWindowEnd);
    if (!arrivalTimes.ok) return arrivalTimes;
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
    if (input.recurringSchedule) {
      if (input.serviceType !== "RECURRING") {
        return { ok: false, message: "Recurring schedule applies only to recurring cleans." };
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
      expectedDurationMinutes: input.expectedDurationMinutes,
      arrivalWindowStart: arrivalTimes.arrivalWindowStart,
      arrivalWindowEnd: arrivalTimes.arrivalWindowEnd,
      draftCleanerIds: cleanerIds,
      snapshot: snapshotVisit(customer, property),
      specialInstructions: input.specialInstructions.trim(),
      pricePerVisitCents: input.pricePerVisitCents,
      status: withSeries ? "SCHEDULED" : "DRAFT",
      createdAt: now,
      createdBy: "kelsey",
      updatedAt: now,
      updatedBy: "kelsey",
    };
    if (!input.recurringSchedule) {
      setState({ ...data, jobs: [job, ...data.jobs] });
      return { ok: true, jobId, message: "Cleaning saved." };
    }
    const recurrence: RecurrenceRule = {
      frequency: "WEEK",
      interval: input.recurringSchedule.interval,
      daysOfWeek: [dayOfWeek(input.date)],
    };
    const rule = validateRecurrenceRule(recurrence, input.date);
    if (!rule.ok) return rule;
    const seriesId = `series-${Date.now()}`;
    const series: RecurringSeries = {
      seriesId,
      customerId: customer.customerId,
      propertyId: property.propertyId,
      recurrence,
      startDate: input.date,
      endMode: "UNTIL_CANCELED",
      defaultHeadcountNeeded: job.headcountNeeded,
      defaultArrivalWindowStart: arrivalTimes.arrivalWindowStart,
      defaultArrivalWindowEnd: arrivalTimes.arrivalWindowEnd,
      defaultExpectedDurationMinutes: input.expectedDurationMinutes,
      defaultServiceType: "RECURRING",
      defaultSpecialInstructions: input.specialInstructions.trim() || undefined,
      defaultPricePerVisitCents: input.pricePerVisitCents,
      staffingTemplateMode: "BLANK",
      staffingTemplate: [],
      status: "ACTIVE",
      generatedThroughDate: input.date,
      createdAt: now,
      createdBy: "kelsey",
      updatedAt: now,
      updatedBy: "kelsey",
    };
    const linkedJob: Job = { ...job, seriesId };
    const base = {
      ...data,
      series: [...data.series, series],
      jobs: [linkedJob, ...data.jobs],
    };
    const generated = mergeRecurringHorizon({
      ...base,
      today: data.today,
      nowIso: now,
    });
    setState({
      ...base,
      series: generated.series,
      jobs: generated.jobs,
      assignments: generated.assignments,
    });
    return { ok: true, jobId, message: "Recurring cleaning and schedule saved." };
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
    const arrivalTimes = validateArrivalWindow(input.arrivalWindowStart, input.arrivalWindowEnd);
    if (!arrivalTimes.ok) return arrivalTimes;
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
    if (!Number.isInteger(input.payPerPersonCents) || input.payPerPersonCents < 0) {
      return { ok: false, message: "Enter the pay per person." };
    }
    const now = new Date().toISOString();
    const detail = {
      cleanerId: cleaner.cleanerId,
      arrivalWindowStart: arrivalTimes.arrivalWindowStart,
      arrivalWindowEnd: arrivalTimes.arrivalWindowEnd,
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
    const planned = plan.assignments[0];
    if (!planned) return { ok: false, message: "The cleaning could not be assigned." };
    const assignment: JobAssignment = {
      ...planned,
      lastNotified: assignmentNotice(detail),
      notifiedServiceDate: job.date,
    };
    let nextAssignments = [...data.assignments, assignment];
    if (input.mode === "DIRECT" || assignment.status === "CONFIRMED" || assignment.status === "PENDING_AVAILABILITY") {
      nextAssignments = expireJobInvitesIfHeadcountMet(nextAssignments, job.jobId, job.headcountNeeded, now);
    }
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
    const message = assignmentSavedMessage(cleaner, assignment, input.mode);
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
    const arrivalTimes = validateArrivalWindow(input.arrivalWindowStart, input.arrivalWindowEnd);
    if (!arrivalTimes.ok) return arrivalTimes;
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
      const blocked = calculateBlockedRange({
        date: job.date,
        arrivalWindowStart: arrivalTimes.arrivalWindowStart,
        arrivalWindowEnd: arrivalTimes.arrivalWindowEnd,
        expectedDurationMinutes: input.expectedDurationMinutes,
      });
      let nextAssignments = data.assignments.map((item) => {
        if (item.assignmentId !== existing.assignmentId) return item;
        let nextItem: JobAssignment = {
          ...item,
          proposedCrewSize: input.proposedCrewSize,
          pendingCrewSize: item.status === "PENDING_AVAILABILITY" ? input.proposedCrewSize : item.pendingCrewSize,
          confirmedCrewSize: item.status === "CONFIRMED" ? input.proposedCrewSize : item.confirmedCrewSize,
          arrivalWindowStart: arrivalTimes.arrivalWindowStart,
          arrivalWindowEnd: arrivalTimes.arrivalWindowEnd,
          expectedDurationMinutes: input.expectedDurationMinutes,
          payType: input.payType,
          payPerPersonCents: input.payPerPersonCents,
          proposedTotalPayCents: pay,
          confirmedTotalPayCents: item.status === "CONFIRMED" ? pay : item.confirmedTotalPayCents,
          lastNotified: item.lastNotified ?? assignmentNotice(item),
          updatedAt: now,
        };
        if (item.status === "CONFIRMED" || item.status === "NEEDS_ATTENTION") {
          const merged = data.assignments.map((row) => (row.assignmentId === existing.assignmentId ? nextItem : row));
          nextItem = applyScheduleConflictWarning(nextItem, cleaner, merged);
        }
        return nextItem;
      });
      nextAssignments = syncJobAssignmentsToCleaningArrival(
        nextAssignments,
        job.jobId,
        arrivalTimes.arrivalWindowStart,
        arrivalTimes.arrivalWindowEnd,
        now,
      );
      const next = withEarliestArrival(
        jobWithCleaningArrival(job, arrivalTimes.arrivalWindowStart, arrivalTimes.arrivalWindowEnd, now),
        nextAssignments,
      );
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
          arrivalWindowStart: arrivalTimes.arrivalWindowStart,
          arrivalWindowEnd: arrivalTimes.arrivalWindowEnd,
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
      needsDateReinvite: undefined,
    };
    let nextAssignments = existing
      ? data.assignments.map((item) => (item.assignmentId === existing.assignmentId ? savedAssignment : item))
      : [...data.assignments, savedAssignment];
    nextAssignments = syncJobAssignmentsToCleaningArrival(
      nextAssignments,
      job.jobId,
      arrivalTimes.arrivalWindowStart,
      arrivalTimes.arrivalWindowEnd,
      now,
    );
    const next = withEarliestArrival(
      jobWithCleaningArrival(
        {
          ...job,
          draftCleanerIds: (job.draftCleanerIds ?? []).filter((id) => id !== cleaner.cleanerId),
          draftCleanerDetails: (job.draftCleanerDetails ?? []).filter((item) => item.cleanerId !== cleaner.cleanerId),
          status: "SCHEDULED",
        },
        arrivalTimes.arrivalWindowStart,
        arrivalTimes.arrivalWindowEnd,
        now,
      ),
      nextAssignments,
    );
    let assignments = nextAssignments;
    if (
      savedAssignment.status === "CONFIRMED" ||
      savedAssignment.status === "PENDING_AVAILABILITY"
    ) {
      assignments = expireJobInvitesIfHeadcountMet(assignments, job.jobId, job.headcountNeeded, now);
    }
    if (
      savedAssignment.status === "CONFIRMED" &&
      data.submissions.some((submission) => submission.cleanerId === cleaner.cleanerId && submission.weekStart === weekStart)
    ) {
      assignments = revalidatePendingAssignments({
        assignments,
        cleaner,
        weekStart,
        weekEnd: addDays(weekStart, 6),
        windows: data.availability
          .filter((window) => window.cleanerId === cleaner.cleanerId)
          .map((window) => ({ date: window.date, start: window.start, end: window.end })),
        jobs: data.jobs,
        nowIso: now,
      });
    }
    setState({
      ...data,
      jobs: data.jobs.map((item) => (item.jobId === job.jobId ? next : item)),
      assignments,
    });
    const assignMode = input.mode === "INVITE" ? "INVITE" : "DIRECT";
    const message = assignmentSavedMessage(cleaner, savedAssignment, assignMode);
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
    const priceCheck = validatePricePerVisitCents(input.pricePerVisitCents);
    if (priceCheck && !priceCheck.ok) return priceCheck;
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
    const arrivalTimes = validateArrivalWindow(input.arrivalWindowStart, input.arrivalWindowEnd);
    if (!arrivalTimes.ok) return arrivalTimes;
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
    if (input.recurringSchedule) {
      if (job.seriesId) {
        return { ok: false, message: "This cleaning already belongs to a recurring schedule." };
      }
      if (input.serviceType !== "RECURRING") {
        return { ok: false, message: "Recurring schedule applies only to recurring cleans." };
      }
      const headcountForSeries = input.headcountNeeded > 0 ? input.headcountNeeded : 1;
      if (headcountForSeries < 1) {
        return { ok: false, message: "Choose headcount before creating a recurring schedule." };
      }
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
      const perCleaner = validateArrivalWindow(arrival.arrivalWindowStart, arrival.arrivalWindowEnd);
      if (!perCleaner.ok) return perCleaner;
    }
    const now = new Date().toISOString();
    const arrival = { start: arrivalTimes.arrivalWindowStart, end: arrivalTimes.arrivalWindowEnd };
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
        selected.has(item.cleanerId) &&
        item.status !== "CANCELED" &&
        item.status !== "EXPIRED_JOB_FILLED";
      const durationOutOfSync = onVisit && item.expectedDurationMinutes !== input.expectedDurationMinutes;
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
        expectedDurationMinutes: onVisit ? input.expectedDurationMinutes : item.expectedDurationMinutes,
        lastNotified:
          durationOutOfSync && !item.lastNotified ? assignmentNotice(item) : nextLastNotified,
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
      expectedDurationMinutes: input.expectedDurationMinutes,
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
            expectedDurationMinutes: input.expectedDurationMinutes,
          };
        }),
      snapshot: snapshotVisit(customer, property),
      specialInstructions: input.specialInstructions.trim(),
      pricePerVisitCents: input.pricePerVisitCents,
      status: input.recurringSchedule && job.status === "DRAFT" ? "SCHEDULED" : job.status,
      updatedAt: now,
      updatedBy: "kelsey",
    };
    const seriesPatch =
      dateChanged && job.seriesId
        ? data.series.map((item) => {
            if (item.seriesId !== job.seriesId) return item;
            const skipped = new Set([...(item.skippedDates ?? []), job.date]);
            skipped.delete(input.date);
            return { ...item, skippedDates: [...skipped], updatedAt: now, updatedBy: "kelsey" };
          })
        : data.series;

    if (input.recurringSchedule && !job.seriesId) {
      const recurrence: RecurrenceRule = {
        frequency: "WEEK",
        interval: input.recurringSchedule.interval,
        daysOfWeek: [dayOfWeek(input.date)],
      };
      const rule = validateRecurrenceRule(recurrence, input.date);
      if (!rule.ok) return rule;
      const seriesId = `series-${Date.now()}`;
      const series: RecurringSeries = {
        seriesId,
        customerId: customer.customerId,
        propertyId: property.propertyId,
        recurrence,
        startDate: input.date,
        endMode: "UNTIL_CANCELED",
        defaultHeadcountNeeded: headcountNeeded,
        defaultArrivalWindowStart: arrivalTimes.arrivalWindowStart,
        defaultArrivalWindowEnd: arrivalTimes.arrivalWindowEnd,
        defaultExpectedDurationMinutes: input.expectedDurationMinutes,
        defaultServiceType: "RECURRING",
        defaultSpecialInstructions: input.specialInstructions.trim() || undefined,
        defaultPricePerVisitCents: input.pricePerVisitCents,
        staffingTemplateMode: "BLANK",
        staffingTemplate: [],
        status: "ACTIVE",
        generatedThroughDate: input.date,
        createdAt: now,
        createdBy: "kelsey",
        updatedAt: now,
        updatedBy: "kelsey",
      };
      const linkedJob: Job = { ...updatedJob, seriesId };
      const base = {
        ...data,
        series: [...seriesPatch, series],
        jobs: data.jobs.map((item) => (item.jobId === job.jobId ? linkedJob : item)),
        assignments: nextAssignments,
      };
      const generated = mergeRecurringHorizon({
        ...base,
        today: data.today,
        nowIso: now,
      });
      setState({
        ...base,
        series: generated.series,
        jobs: generated.jobs,
        assignments: generated.assignments,
      });
      return { ok: true, message: "Recurring schedule created." };
    }

    setState({
      ...data,
      series: seriesPatch,
      jobs: data.jobs.map((item) => (item.jobId === job.jobId ? updatedJob : item)),
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
    const arrivalTimes = validateArrivalWindow(input.arrivalWindowStart, input.arrivalWindowEnd);
    if (!arrivalTimes.ok) return arrivalTimes;
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
        arrivalWindowStart: arrivalTimes.arrivalWindowStart,
        arrivalWindowEnd: arrivalTimes.arrivalWindowEnd,
        expectedDurationMinutes: input.expectedDurationMinutes,
      });
      const windows = data.availability
        .filter((window) => window.cleanerId === cleaner.cleanerId)
        .map((window) => ({ date: window.date, start: window.start, end: window.end }));
      if (!availabilityCoversBlockedRange(windows, blocked)) {
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
      assignment.status === "CONFIRMED" || assignment.status === "NEEDS_ATTENTION"
        ? calculateBlockedRange({
            date: job.date,
            arrivalWindowStart: arrivalTimes.arrivalWindowStart,
            arrivalWindowEnd: arrivalTimes.arrivalWindowEnd,
            expectedDurationMinutes: input.expectedDurationMinutes,
          })
        : null;
    const nextAssignments = data.assignments.map((item) => {
      if (item.assignmentId !== assignment.assignmentId) return item;
      let nextItem: JobAssignment = {
        ...item,
        proposedCrewSize: input.proposedCrewSize,
        pendingCrewSize: item.status === "PENDING_AVAILABILITY" ? input.proposedCrewSize : item.pendingCrewSize,
        confirmedCrewSize: item.status === "CONFIRMED" ? input.proposedCrewSize : item.confirmedCrewSize,
        arrivalWindowStart: arrivalTimes.arrivalWindowStart,
        arrivalWindowEnd: arrivalTimes.arrivalWindowEnd,
        expectedDurationMinutes: input.expectedDurationMinutes,
        payType: input.payType,
        payPerPersonCents: input.payPerPersonCents,
        proposedTotalPayCents: pay,
        confirmedTotalPayCents: item.status === "CONFIRMED" ? pay : item.confirmedTotalPayCents,
        updatedAt: now,
      };
      if (blocked) {
        const merged = data.assignments.map((row) => (row.assignmentId === assignment.assignmentId ? nextItem : row));
        nextItem = applyScheduleConflictWarning(nextItem, cleaner, merged);
      }
      return nextItem;
    });
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
    const moved = validateArrivalWindow(arrivalWindowStart, arrivalWindowEnd);
    if (!moved.ok) return moved;
    const job = data.jobs.find((item) => item.jobId === assignment.jobId);
    if (!job || job.status === "CANCELED") return { ok: false, message: "That cleaning could not be moved." };
    const cleaner = data.cleaners.find((item) => item.cleanerId === assignment.cleanerId);
    if (!cleaner) return { ok: false, message: "That cleaner could not be found." };
    const now = new Date().toISOString();
    const blocked =
      assignment.status === "CONFIRMED" || assignment.status === "NEEDS_ATTENTION"
        ? calculateBlockedRange({
            date: assignment.serviceDate,
            arrivalWindowStart: moved.arrivalWindowStart,
            arrivalWindowEnd: moved.arrivalWindowEnd,
            expectedDurationMinutes: assignment.expectedDurationMinutes,
          })
        : null;
    setState({
      ...data,
      assignments: data.assignments.map((item) => {
        if (item.assignmentId !== assignment.assignmentId) return item;
        let nextItem: JobAssignment = {
          ...item,
          arrivalWindowStart: moved.arrivalWindowStart,
          arrivalWindowEnd: moved.arrivalWindowEnd,
          updatedAt: now,
        };
        if (blocked) {
          const merged = data.assignments.map((row) => (row.assignmentId === assignment.assignmentId ? nextItem : row));
          nextItem = applyScheduleConflictWarning(nextItem, cleaner, merged);
        }
        return nextItem;
      }),
    });
    return { ok: true };
  }

  function markAssignmentNotified(assignmentId: string): ActionResult {
    const assignment = data.assignments.find((item) => item.assignmentId === assignmentId);
    if (
      !assignment ||
      assignment.status === "CANCELED" ||
      assignment.status === "DECLINED" ||
      assignment.status === "EXPIRED_JOB_FILLED"
    ) {
      return { ok: false, message: "That assignment could not be updated." };
    }
    const now = new Date().toISOString();
    setState({
      ...data,
      assignments: data.assignments.map((item) =>
        item.assignmentId === assignment.assignmentId
          ? {
              ...item,
              lastNotified: assignmentNotice(item),
              notifiedServiceDate: item.serviceDate,
              updatedAt: now,
            }
          : item,
      ),
    });
    return { ok: true };
  }

  function clearDeletedJobUndo() {
    if (deletedJobUndoTimerRef.current !== null) {
      window.clearTimeout(deletedJobUndoTimerRef.current);
      deletedJobUndoTimerRef.current = null;
    }
    setDeletedJobUndo(null);
  }

  function scheduleDeletedJobUndo(snapshot: DeletedJobSnapshot) {
    clearDeletedCustomerUndo();
    clearDeletedJobUndo();
    setDeletedJobUndo(snapshot);
    deletedJobUndoTimerRef.current = window.setTimeout(() => clearDeletedJobUndo(), 8000);
  }

  function undoDeleteJob(): ActionResult {
    if (!deletedJobUndo) return { ok: false, message: "That cleaning could not be restored." };
    const { job, assignments, seriesSkippedDatesBefore } = deletedJobUndo;
    clearDeletedJobUndo();
    setState({
      ...data,
      jobs: [...data.jobs, job].sort(
        (a, b) => a.date.localeCompare(b.date) || a.jobId.localeCompare(b.jobId),
      ),
      assignments: [...data.assignments, ...assignments],
      series: seriesSkippedDatesBefore
        ? data.series.map((item) =>
            item.seriesId === seriesSkippedDatesBefore.seriesId
              ? { ...item, skippedDates: seriesSkippedDatesBefore.skippedDates }
              : item,
          )
        : data.series,
    });
    return { ok: true, message: "Cleaning restored." };
  }

  function deleteJob(jobId: string): ActionResult {
    const job = data.jobs.find((item) => item.jobId === jobId);
    if (!job) return { ok: false, message: "That cleaning could not be deleted." };
    if (jobHasCleanerBlockingDeletion(data.assignments, jobId)) {
      return { ok: false, message: CLEANING_DELETE_BLOCKED_MESSAGE };
    }
    const snapshot: DeletedJobSnapshot = {
      job,
      assignments: data.assignments.filter((item) => item.jobId === jobId),
    };
    if (job.seriesId) {
      const series = data.series.find((item) => item.seriesId === job.seriesId);
      if (series) {
        snapshot.seriesSkippedDatesBefore = {
          seriesId: series.seriesId,
          skippedDates: [...(series.skippedDates ?? [])],
        };
      }
    }
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
    scheduleDeletedJobUndo(snapshot);
    return { ok: true, message: "Cleaning deleted." };
  }

  function applyCleanerSmsConsent(input: {
    smsSchedulingOptIn: boolean;
    smsOptInRecordedAt: string;
    mobilePhone?: string;
    smsConsentPhone?: string;
    smsConsentRecordedAt?: string;
    smsConsentDisclosureVersion?: string;
    smsConsentMethod?: string;
  }): void {
    if (!data.cleanerId) return;
    setState({
      ...data,
      cleaners: data.cleaners.map((cleaner) =>
        cleaner.cleanerId === data.cleanerId
          ? {
              ...cleaner,
              ...(input.mobilePhone ? { mobilePhone: input.mobilePhone } : {}),
              smsSchedulingOptIn: input.smsSchedulingOptIn,
              smsOptInRecordedAt: input.smsOptInRecordedAt,
              smsConsentPhone: input.smsConsentPhone,
              smsConsentRecordedAt: input.smsConsentRecordedAt,
              smsConsentDisclosureVersion: input.smsConsentDisclosureVersion,
              smsConsentMethod: input.smsConsentMethod,
              updatedAt: input.smsOptInRecordedAt,
            }
          : cleaner,
      ),
    });
  }

  function refreshRecurringHorizon(): void {
    if (data.series.length === 0) return;
    const today = todayInBusinessZone();
    const generated = mergeRecurringHorizon({
      ...data,
      today,
      nowIso: new Date().toISOString(),
    });
    if (
      generated.jobs.length === data.jobs.length &&
      generated.assignments.length === data.assignments.length &&
      generated.series.every(
        (item, index) => item.generatedThroughDate === data.series[index]?.generatedThroughDate,
      )
    ) {
      return;
    }
    setState({
      ...data,
      today,
      series: generated.series,
      jobs: generated.jobs,
      assignments: generated.assignments,
    });
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
    ready,
    previewAuth,
    flash: (message) => setToast(message),
    flashLoading: (message) => {
      setToast(message);
      setActionLoading((count) => count + 1);
    },
    clearActionLoading: () => setActionLoading((count) => Math.max(0, count - 1)),
    queueSchedulingSms: (promise, fallbackSavedMessage) => {
      setNotificationPending((count) => count + 1);
      queueSchedulingSmsDelivery(
        (message) => setToast(message),
        (prompt) => setManualCleanerText(prompt),
        promise,
        fallbackSavedMessage,
        () => setNotificationPending((count) => Math.max(0, count - 1)),
      );
    },
    showManualCleanerText: (prompt) => setManualCleanerText(prompt),
    dismissManualCleanerText: () => setManualCleanerText(null),
    enterAdmin: () => {
      if (!previewAuth || !previewAuthAllowed()) return;
      const full = previewDynamoHubRef.current;
      if (full) {
        setState({ ...withCurrentHorizon(full), role: "ADMIN", cleanerId: null });
        return;
      }
      setState({ ...data, role: "ADMIN", cleanerId: null });
    },
    enterCleaner: (cleanerId) => {
      if (!previewAuth || !previewAuthAllowed()) return;
      const full = previewDynamoHubRef.current;
      if (full) {
        setState({
          ...withCurrentHorizon(hubDataForCleaner(full, cleanerId)),
          role: "CLEANER",
          cleanerId,
        });
        return;
      }
      setState({ ...data, role: "CLEANER", cleanerId });
    },
    signOut: async () => {
      if (!previewAuth) {
        try {
          await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
        } catch {
          /* still clear local session */
        }
      }
      const full = previewDynamoHubRef.current;
      if (full) {
        setState({ ...withCurrentHorizon(full), role: null, cleanerId: null });
      } else {
        setState({ ...data, role: null, cleanerId: null });
      }
      try {
        sessionStorage.removeItem(SESSION_KEY);
        sessionStorage.setItem(SIGNED_OUT_STORAGE_KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
    },
    acceptInvitation,
    declineInvitation,
    submitAvailability,
    saveCustomer,
    deleteCustomer,
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
    markAssignmentNotified,
    deleteJob,
    deleteSeries,
    refreshRecurringHorizon,
    applyCleanerSmsConsent,
    undoDeleteJob,
    undoDeleteCustomer,
  };

  return (
    <HubContext.Provider value={value}>
      <HubRemoteSyncBlockerProvider register={registerRemoteSyncBlocker}>
        <PreviewModeBanner />
        {children}
        {notificationPending > 0 || actionLoading > 0 || toast || deletedJobUndo || deletedCustomerUndo || manualCleanerText ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex flex-col items-center gap-2 px-5">
          {actionLoading > 0 && !toast && !deletedJobUndo && !deletedCustomerUndo && notificationPending === 0 ? (
            <p
              role="status"
              aria-live="polite"
              className="flex items-center justify-center rounded-full bg-mint px-4 py-2.5 shadow-[0_8px_24px_rgba(51,51,51,0.12)]"
            >
              <span
                className="size-4 animate-spin rounded-full border-2 border-ink/25 border-t-ink"
                aria-hidden="true"
              />
              <span className="sr-only">Loading…</span>
            </p>
          ) : null}
          {notificationPending > 0 && !toast && !deletedJobUndo && !deletedCustomerUndo && actionLoading === 0 ? (
            <p
              role="status"
              aria-live="polite"
              className="flex items-center justify-center rounded-full bg-mint px-4 py-2.5 shadow-[0_8px_24px_rgba(51,51,51,0.12)]"
            >
              <span
                className="size-4 animate-spin rounded-full border-2 border-ink/25 border-t-ink"
                aria-hidden="true"
              />
              <span className="sr-only">Sending notification…</span>
            </p>
          ) : null}
          {deletedJobUndo ? (
            <div
              role="status"
              className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-full bg-mint px-4 py-2.5 text-sm font-medium text-ink shadow-[0_8px_24px_rgba(51,51,51,0.12)]"
            >
              <span>{toast ?? "Cleaning deleted."}</span>
              <button
                type="button"
                className="shrink-0 font-semibold text-ink underline decoration-ink/40 underline-offset-2"
                onClick={() => {
                  const result = undoDeleteJob();
                  if (result.message) setToast(result.message);
                }}
              >
                Undo
              </button>
            </div>
          ) : deletedCustomerUndo ? (
            <div
              role="status"
              className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-full bg-mint px-4 py-2.5 text-sm font-medium text-ink shadow-[0_8px_24px_rgba(51,51,51,0.12)]"
            >
              <span>{toast ?? "Customer deleted."}</span>
              <button
                type="button"
                className="shrink-0 font-semibold text-ink underline decoration-ink/40 underline-offset-2"
                onClick={() => {
                  const result = undoDeleteCustomer();
                  if (result.message) setToast(result.message);
                }}
              >
                Undo
              </button>
            </div>
          ) : toast ? (
            <p
              role="status"
              aria-live="polite"
              className="flex max-w-md items-center gap-2 rounded-full bg-mint px-4 py-2 text-sm font-medium text-ink shadow-[0_8px_24px_rgba(51,51,51,0.12)]"
            >
              {actionLoading > 0 ? (
                <span
                  className="size-4 shrink-0 animate-spin rounded-full border-2 border-ink/25 border-t-ink"
                  aria-hidden="true"
                />
              ) : null}
              <span>{toast}</span>
            </p>
          ) : null}
          {manualCleanerText ? (
            <div className="pointer-events-auto w-full max-w-md">
              <ManualCleanerTextPrompt
                firstName={manualCleanerText.firstName}
                href={manualCleanerText.href}
                detail={manualCleanerText.detail}
                onDismiss={() => setManualCleanerText(null)}
              />
            </div>
          ) : null}
        </div>
        ) : null}
      </HubRemoteSyncBlockerProvider>
    </HubContext.Provider>
  );
}

export function useHub(): HubContextValue {
  const value = useContext(HubContext);
  if (!value) throw new Error("useHub must be used within HubProvider");
  return value;
}

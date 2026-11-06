"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, startTransition } from "react";
import { beginJobCleanerMutation, endJobCleanerMutation } from "@/components/job-cleaner-busy";
import { HubRemoteSyncBlockerProvider } from "@/components/hub-sync";
import { usePathname } from "next/navigation";
import {
  acceptInvitationAction,
  declineInvitationAction,
  submitAvailabilityAction,
  submitCleanerAvailabilityAdminAction,
} from "@/app/actions/cleaner-hub";
import {
  saveContractorQuestionnaireDraftAction,
  submitContractorQuestionnaireAction,
} from "@/app/actions/contractor-questionnaire";
import { ManualCleanerTextPrompt } from "@/components/admin/manual-cleaner-text-prompt";
import { PreviewModeBanner } from "@/components/preview-mode-banner";
import {
  queueSchedulingSmsDelivery,
  type ManualCleanerTextPrompt as ManualCleanerTextOffer,
} from "@/lib/cleaner/deliver-scheduling-sms";
import {
  addJobCleanerAction,
  deleteCustomerAction,
  deleteJobAction,
  deleteSeriesAction,
  markAssignmentNotifiedAction,
  moveAssignmentTimeAction,
  removeJobCleanerAction,
  saveCleanerDetailsAction,
  saveCustomerAction,
  saveSeriesAction,
  staffCleanerAction,
  undoDeleteCustomerAction,
  undoDeleteJobAction,
  updateCleanerAdminAction,
  updateJobAction,
  updateVisitAction,
  type AdminHubActionResult,
} from "@/app/actions/admin-hub";
import { createJobAction } from "@/app/actions/admin-jobs";
import { completeAssignmentAction } from "@/app/actions/admin-assignments";
import { bootstrapHub, bootstrapAdminHubSupplement, type BootstrapResult } from "@/app/actions/hub-data";
import {
  addJobCleanerOnHub,
  deleteCustomerOnHub,
  deleteJobOnHub,
  deleteSeriesOnHub,
  markAssignmentNotifiedOnHub,
  moveAssignmentTimeOnHub,
  removeJobCleanerOnHub,
  saveCleanerDetailsOnHub,
  saveCustomerOnHub,
  saveSeriesOnHub,
  staffCleanerOnHub,
  undoDeleteCustomerOnHub,
  undoDeleteJobOnHub,
  updateJobOnHub,
  updateVisitOnHub,
  type AdminHubApplierResult,
} from "@/lib/hub/admin-hub-appliers";
import { hubMutationPatch, mergeHubPatchIntoHub, type HubPatchRemove } from "@/lib/hub/merge-hub-patch";
import type {
  CompleteAssignmentInput,
  CreateJobInput,
  DeletedCustomerSnapshot,
  DeletedJobSnapshot,
  SaveCleanerDetailsInput,
  SaveSeriesInput,
  StaffCleanerInput,
  UpdateJobInput,
  UpdateVisitInput,
} from "@/lib/hub/admin-hub-types";
import { updateCleanerAdminOnHub, type UpdateCleanerAdminInput } from "@/lib/hub/admin-mutations";
import { completeAssignmentOnHub } from "@/lib/hub/complete-assignment-mutations";
import { createJobOnHub } from "@/lib/hub/create-job-mutations";
import { purgeAssignmentSmsLogsOnCleanerRemoval } from "@/app/actions/assignment-sms-log-cleanup";
import { submitAvailabilityOnHub } from "@/lib/hub/cleaner-mutations";
import { saveContractorQuestionnaireOnHub } from "@/lib/hub/contractor-questionnaire-mutations";
import type { ContractorQuestionnaireInput } from "@/lib/domain/contractor-questionnaire";
import { hubDataForCleaner } from "@/lib/auth/hub-scope";
import { previewAuthAllowed } from "@/lib/auth/preview-mode";
import { SIGNED_OUT_STORAGE_KEY } from "@/lib/auth/signed-out-guard";
import type { CustomerInput } from "@/lib/domain/customers";
import {
  expireRemainingInvitationsWhenFilled,
  revalidatePendingAssignments,
  validateInvitationAcceptance,
  withAssignmentConfirmed,
  withAssignmentDeclined,
} from "@/lib/domain/invitations";
import { mergeRecurringHorizon } from "@/lib/domain/recurrence";
import { reconcileScheduleConflictWarnings } from "@/lib/domain/scheduling";
import { addDays, mondayOf, todayInBusinessZone } from "@/lib/domain/time";
import { emptyHub, type HubData } from "@/lib/mock/seed";
import type { AppRole, AvailabilityWindow } from "@/lib/domain/types";

export type {
  CompleteAssignmentInput,
  CreateJobInput,
  SaveCleanerDetailsInput,
  StaffCleanerInput,
  UpdateJobInput,
  UpdateVisitInput,
} from "@/lib/hub/admin-hub-types";

const STORAGE_KEY = "ghh-preview-v2";
const SESSION_KEY = "ghh-session-v2";
/** Background refresh while the tab is visible (admin ↔ cleaner, multiple tabs). */
const REMOTE_SYNC_INTERVAL_MS = 20_000;

type HubState = HubData & {
  role: AppRole | null;
  cleanerId: string | null;
};

type ActionResult =
  | { ok: true; message?: string; customerId?: string; jobId?: string; assignmentId?: string }
  | { ok: false; message: string };
type AsyncActionResult = Promise<ActionResult>;

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
  saveContractorQuestionnaireDraft: (
    input: ContractorQuestionnaireInput,
  ) => Promise<{ ok: true; message: string } | { ok: false; message: string }>;
  submitContractorQuestionnaire: (
    input: ContractorQuestionnaireInput,
    attestation: import("@/lib/domain/contractor-questionnaire-submission").ContractorQuestionnaireSubmitAttestation,
  ) => Promise<
    | { ok: true; message: string }
    | { ok: false; message: string; fieldErrors?: Record<string, string> }
  >;
  mergeAdminHub: (remote: HubData) => void;
  saveCustomer: (input: CustomerInput, customerId?: string) => AsyncActionResult;
  deleteCustomer: (customerId: string) => AsyncActionResult;
  saveSeries: (seriesId: string, input: SaveSeriesInput) => AsyncActionResult;
  updateCleanerAdmin: (cleanerId: string, input: UpdateCleanerAdminInput) => AsyncActionResult;
  createJob: (input: CreateJobInput) => AsyncActionResult;
  saveCleanerDetails: (input: SaveCleanerDetailsInput) => AsyncActionResult;
  staffCleaner: (input: StaffCleanerInput) => AsyncActionResult;
  completeAssignment: (input: CompleteAssignmentInput) => AsyncActionResult;
  addJobCleaner: (jobId: string, cleanerId: string) => AsyncActionResult;
  removeJobCleaner: (jobId: string, cleanerId: string) => AsyncActionResult;
  updateVisit: (input: UpdateVisitInput) => AsyncActionResult;
  updateJob: (input: UpdateJobInput) => AsyncActionResult;
  moveAssignmentTime: (assignmentId: string, arrivalWindowStart: string, arrivalWindowEnd: string) => AsyncActionResult;
  markAssignmentNotified: (assignmentId: string) => AsyncActionResult;
  deleteJob: (jobId: string) => AsyncActionResult;
  deleteSeries: (seriesId: string) => AsyncActionResult;
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
  undoDeleteJob: () => AsyncActionResult;
  undoDeleteCustomer: () => AsyncActionResult;
};

const HubContext = createContext<HubContextValue | null>(null);

function deletedCustomerSnapshotFromHub(hub: HubData, customerId: string): DeletedCustomerSnapshot | null {
  const customer = hub.customers.find((item) => item.customerId === customerId);
  if (!customer) return null;
  return {
    customer,
    properties: hub.properties.filter((item) => item.customerId === customerId),
  };
}

function deletedJobSnapshotFromHub(hub: HubData, jobId: string): DeletedJobSnapshot | null {
  const job = hub.jobs.find((item) => item.jobId === jobId);
  if (!job) return null;
  const snapshot: DeletedJobSnapshot = {
    job,
    assignments: hub.assignments.filter((item) => item.jobId === jobId),
  };
  if (job.seriesId) {
    const series = hub.series.find((item) => item.seriesId === job.seriesId);
    if (series) {
      snapshot.seriesSkippedDatesBefore = {
        seriesId: series.seriesId,
        skippedDates: [...(series.skippedDates ?? [])],
      };
    }
  }
  return snapshot;
}

function assignmentIdsRemovedByVisitUpdate(hub: HubData, jobId: string, cleanerIds: string[]): string[] {
  const selected = new Set(cleanerIds);
  return hub.assignments
    .filter(
      (item) =>
        item.jobId === jobId &&
        !selected.has(item.cleanerId) &&
        item.status !== "CANCELED" &&
        item.status !== "EXPIRED_JOB_FILLED",
    )
    .map((item) => item.assignmentId);
}

function withReconciledScheduleConflicts(state: HubState): HubState {
  return {
    ...state,
    assignments: reconcileScheduleConflictWarnings(state.assignments, state.cleaners),
  };
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

function dynamoBootstrap(remote: BootstrapResult | null): Extract<BootstrapResult, { source: "dynamodb" }> | null {
  if (!remote || "ok" in remote || remote.source !== "dynamodb") return null;
  return remote;
}

export function HubProvider({
  children,
  initialAuth = null,
  initialPreviewAuth = false,
  initialBootstrap = null,
}: {
  children: React.ReactNode;
  initialAuth?: InitialAuth | null;
  /** Server-known preview mode (no AUTH_SESSION_SECRET, non-production). */
  initialPreviewAuth?: boolean;
  initialBootstrap?: BootstrapResult | null;
}) {
  const serverHub = dynamoBootstrap(initialBootstrap);
  const [state, setStateInner] = useState<HubState | null>(() => {
    if (serverHub && initialAuth?.role) {
      return {
        ...withCurrentHorizon(serverHub.data),
        role: initialAuth.role,
        cleanerId: initialAuth.cleanerId,
      };
    }
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
  const [ready, setReady] = useState(() => Boolean(serverHub && initialAuth?.role));
  const [hubDataSource, setHubDataSource] = useState<"preview" | "dynamodb" | null>(() =>
    serverHub && initialAuth?.role ? "dynamodb" : null,
  );
  const sourceRef = useRef<"preview" | "dynamodb" | null>(serverHub && initialAuth?.role ? "dynamodb" : null);
  const bootstrappedRef = useRef(Boolean(serverHub && initialAuth?.role));
  /** Full hub from Dynamo when using preview auth (role picker without Cognito session). */
  const previewDynamoHubRef = useRef<HubData | null>(null);
  const syncBlockersRef = useRef(new Set<() => boolean>());
  const syncInFlightRef = useRef(false);
  const hubRevisionRef = useRef<number | null>(serverHub?.revision ?? null);
  const skipPersistForRemoteSyncRef = useRef(false);
  const staffingSaveInFlightRef = useRef(false);
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
    if (staffingSaveInFlightRef.current) return true;
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

      const revisionQuery =
        hubRevisionRef.current !== null ? `?revision=${encodeURIComponent(String(hubRevisionRef.current))}` : "";
      const response = await fetch(`/api/hub/sync${revisionQuery}`, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) return;
      const remote = (await response.json()) as
        | { ok: false; message: string }
        | { source: "preview" }
        | { source: "dynamodb"; mode: "full"; data: HubData; revision: number }
        | { source: "dynamodb"; mode: "patch"; data: HubData; revision: number };
      if ("ok" in remote || remote.source !== "dynamodb") return;
      if (remoteSyncBlocked()) return;
      const prev = stateRef.current;
      if (!prev?.role) return;
      const previewPick = previewAuthRef.current;
      if (previewPick && remote.mode === "full") previewDynamoHubRef.current = remote.data;
      let hubPayload = remote.data;
      if (previewPick && prev.role === "CLEANER" && prev.cleanerId && remote.mode === "full") {
        hubPayload = hubDataForCleaner(remote.data, prev.cleanerId);
      }
      hubRevisionRef.current = remote.revision;
      const mergedBase =
        remote.mode === "patch"
          ? withCurrentHorizon(mergeHubPatchIntoHub(prev, hubPayload))
          : withCurrentHorizon(hubPayload);
      if (remote.mode === "patch" && sortedHubSnapshot(prev) === sortedHubSnapshot(mergedBase)) return;
      if (remote.mode === "full" && sortedHubSnapshot(prev) === sortedHubSnapshot(mergedBase)) return;
      const next = { ...mergedBase, role: prev.role, cleanerId: prev.cleanerId };
      skipPersistForRemoteSyncRef.current = true;
      setState(next);
    } catch (error) {
      console.error("Remote hub sync failed.", error);
    } finally {
      syncInFlightRef.current = false;
    }
  }, [hubDataSource]);

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
        if (data.session) {
          return {
            role: data.session.role,
            cleanerId: data.session.cleanerId,
            preview: false,
          };
        }
        return { role: null, cleanerId: null, preview: false };
      } catch {
        if (initialAuth?.role) {
          return {
            role: initialAuth.role,
            cleanerId: initialAuth.cleanerId,
            preview: false,
          };
        }
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
        const previewPick = auth.preview || (initialPreviewAuth && previewAuthAllowed());
        const role = previewPick ? auth.role : (auth.role ?? initialAuth?.role ?? null);
        if (bootstrappedRef.current && sourceRef.current === "dynamodb" && !previewPick) {
          setReady(true);
          if (role === "ADMIN") {
            void bootstrapAdminHubSupplement().then((supplement) => {
              if (cancelled) return;
              if (!("ok" in supplement) || !supplement.ok) return;
              setState((prev) => {
                if (!prev?.role) return prev;
                const merged = withCurrentHorizon(mergeHubPatchIntoHub(prev, supplement.data));
                return { ...merged, role: prev.role, cleanerId: prev.cleanerId };
              });
            });
          }
          return;
        }
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
          if (role === "ADMIN") {
            void bootstrapAdminHubSupplement().then((supplement) => {
              if (cancelled) return;
              if (!("ok" in supplement) || !supplement.ok) return;
              setState((prev) => {
                if (!prev?.role) return prev;
                const merged = withCurrentHorizon(mergeHubPatchIntoHub(prev, supplement.data));
                return { ...merged, role: prev.role, cleanerId: prev.cleanerId };
              });
            });
          }
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
      skipPersistForRemoteSyncRef.current = true;
      hubRevisionRef.current = remote.revision;
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
      skipPersistForRemoteSyncRef.current = true;
      hubRevisionRef.current = remote.revision;
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
    if (sourceRef.current === "dynamodb" && data.role === "ADMIN") {
      const remote = await submitCleanerAvailabilityAdminAction(cleanerId, weekStart, windows);
      if (!remote.ok) return remote;
      skipPersistForRemoteSyncRef.current = true;
      hubRevisionRef.current = remote.revision;
      applyAdminHubPatch(remote.hub, remote.remove);
      if (!options?.quiet) setToast(toastMessage);
      return { ok: true, message: remote.message };
    }
    if (sourceRef.current === "dynamodb" && data.role === "CLEANER") {
      if (data.cleanerId !== cleanerId) {
        return { ok: false, message: "You can only edit your own availability." };
      }
      const remote = await submitAvailabilityAction(weekStart, windows);
      if (!remote.ok) return remote;
      skipPersistForRemoteSyncRef.current = true;
      hubRevisionRef.current = remote.revision;
      applyAdminHubPatch(remote.data, remote.remove);
      if (!options?.quiet) setToast(toastMessage);
      return { ok: true, message: remote.message };
    }
    const snapshot = stateRef.current ?? data;
    const preview = submitAvailabilityOnHub(snapshot, cleanerId, weekStart, windows);
    if (!preview.result.ok) return preview.result;
    setState((prev) => {
      if (!prev) return prev;
      const { hub } = submitAvailabilityOnHub(prev, cleanerId, weekStart, windows);
      return { ...hub, role: prev.role, cleanerId: prev.cleanerId };
    });
    if (!options?.quiet) setToast(toastMessage);
    return { ok: true, message: toastMessage };
  }

  async function saveContractorQuestionnaireDraft(
    input: ContractorQuestionnaireInput,
  ): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
    if (sourceRef.current === "dynamodb" && data.role === "CLEANER") {
      if (!data.cleanerId) return { ok: false, message: "Your cleaner profile is not linked in Hub." };
      const remote = await saveContractorQuestionnaireDraftAction(input);
      if (!remote.ok) return remote;
      const prev = stateRef.current ?? data;
      const prevCleaner = prev.cleaners.find((item) => item.cleanerId === data.cleanerId);
      const nextCleaner = remote.data.cleaners.find((item) => item.cleanerId === data.cleanerId);
      const draftUnchanged =
        prevCleaner &&
        nextCleaner &&
        JSON.stringify(prevCleaner.businessQuestionnaireDraft ?? null) ===
          JSON.stringify(nextCleaner.businessQuestionnaireDraft ?? null);
      if (!draftUnchanged) {
        startTransition(() => {
          setState({ ...remote.data, role: data.role, cleanerId: data.cleanerId });
        });
      }
      return { ok: true, message: remote.message };
    }
    const cleanerId = data.cleanerId;
    if (!cleanerId) return { ok: false, message: "Your cleaner profile is not linked in Hub." };
    const now = new Date().toISOString();
    const snapshot = stateRef.current ?? data;
    const preview = saveContractorQuestionnaireOnHub(snapshot, cleanerId, input, "preview", now, "draft");
    if (!preview.result.ok) return preview.result;
    startTransition(() => {
      setState((prev) => {
        if (!prev) return prev;
        const outcome = saveContractorQuestionnaireOnHub(prev, cleanerId, input, "preview", now, "draft");
        const prevCleaner = prev.cleaners.find((item) => item.cleanerId === cleanerId);
        const nextCleaner = outcome.hub.cleaners.find((item) => item.cleanerId === cleanerId);
        if (
          prevCleaner &&
          nextCleaner &&
          JSON.stringify(prevCleaner.businessQuestionnaireDraft ?? null) ===
            JSON.stringify(nextCleaner.businessQuestionnaireDraft ?? null)
        ) {
          return prev;
        }
        return { ...outcome.hub, role: prev.role, cleanerId: prev.cleanerId };
      });
    });
    return { ok: true, message: "Form saved." };
  }

  async function submitContractorQuestionnaire(
    input: ContractorQuestionnaireInput,
    attestation: import("@/lib/domain/contractor-questionnaire-submission").ContractorQuestionnaireSubmitAttestation,
  ): Promise<
    | { ok: true; message: string }
    | { ok: false; message: string; fieldErrors?: Record<string, string> }
  > {
    if (sourceRef.current === "dynamodb" && data.role === "CLEANER") {
      if (!data.cleanerId) return { ok: false, message: "Your cleaner profile is not linked in Hub." };
      const remote = await submitContractorQuestionnaireAction(input, attestation);
      if (!remote.ok) {
        return {
          ok: false,
          message: remote.message,
          fieldErrors: remote.fieldErrors,
        };
      }
      setState({ ...remote.data, role: data.role, cleanerId: data.cleanerId });
      return { ok: true, message: remote.message };
    }
    const cleanerId = data.cleanerId;
    if (!cleanerId) return { ok: false, message: "Your cleaner profile is not linked in Hub." };
    const now = new Date().toISOString();
    const snapshot = stateRef.current ?? data;
    const preview = saveContractorQuestionnaireOnHub(snapshot, cleanerId, input, "preview", now, "submit", {
      attestation,
      cognitoSub: "preview-cleaner",
      email: data.cleaners.find((item) => item.cleanerId === cleanerId)?.email ?? "preview@example.com",
    });
    if (!preview.result.ok) {
      return {
        ok: false,
        message: preview.result.message,
        fieldErrors: preview.fieldErrors
          ? Object.fromEntries(Object.entries(preview.fieldErrors).map(([key, value]) => [key, value]))
          : undefined,
      };
    }
    setState((prev) => {
      if (!prev) return prev;
      const outcome = saveContractorQuestionnaireOnHub(prev, cleanerId, input, "preview", now, "submit", {
        attestation,
        cognitoSub: "preview-cleaner",
        email: prev.cleaners.find((item) => item.cleanerId === cleanerId)?.email ?? "preview@example.com",
      });
      return { ...outcome.hub, role: prev.role, cleanerId: prev.cleanerId };
    });
    return { ok: true, message: "Submitted." };
  }


  function applyAdminHubPatch(patch: HubData, remove?: HubPatchRemove) {
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...withCurrentHorizon(mergeHubPatchIntoHub(prev, patch, { remove })),
        role: prev.role,
        cleanerId: prev.cleanerId,
      };
    });
  }

  function mergeAdminHub(remote: HubData) {
    applyAdminHubPatch(remote);
  }

  function applyPreviewMutation(outcome: AdminHubApplierResult): ActionResult {
    if (!outcome.ok) return outcome;
    const { patch, remove } = hubMutationPatch(data, outcome.hub);
    applyAdminHubPatch(patch, remove);
    return {
      ok: true,
      message: outcome.message,
      customerId: outcome.customerId,
      jobId: outcome.jobId,
      assignmentId: outcome.assignmentId,
    };
  }

  async function applyAdminJobStaffingResult(remote: AdminHubActionResult): Promise<ActionResult> {
    return applyAdminActionResult(remote);
  }

  async function applyAdminActionResult(remote: AdminHubActionResult): Promise<ActionResult> {
    if (!remote.ok) return remote;
    skipPersistForRemoteSyncRef.current = true;
    hubRevisionRef.current = remote.revision;
    applyAdminHubPatch(remote.hub, remote.remove);
    return {
      ok: true,
      message: remote.message,
      customerId: remote.customerId,
      jobId: remote.jobId,
      assignmentId: remote.assignmentId,
    };
  }

  function isDynamoAdmin(): boolean {
    return sourceRef.current === "dynamodb" && data.role === "ADMIN";
  }

  function scheduleAssignmentSmsLogPurge(assignmentId: string) {
    if (sourceRef.current !== "dynamodb") return;
    void purgeAssignmentSmsLogsOnCleanerRemoval(assignmentId).then((result) => {
      if (!result.ok) console.error(result.message ?? "Could not clear assignment text history.");
    });
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

  async function saveCustomer(input: CustomerInput, customerId?: string): AsyncActionResult {
    if (isDynamoAdmin()) return applyAdminActionResult(await saveCustomerAction(input, customerId));
    return applyPreviewMutation(saveCustomerOnHub(data, input, customerId));
  }

  async function deleteCustomer(customerId: string): AsyncActionResult {
    const snapshot = deletedCustomerSnapshotFromHub(data, customerId);
    if (isDynamoAdmin()) {
      const result = await applyAdminActionResult(await deleteCustomerAction(customerId));
      if (result.ok && snapshot) scheduleDeletedCustomerUndo(snapshot);
      return result;
    }
    const outcome = deleteCustomerOnHub(data, customerId);
    if (!outcome.ok) return outcome;
    if (snapshot) scheduleDeletedCustomerUndo(snapshot);
    return applyPreviewMutation(outcome);
  }

  async function undoDeleteCustomer(): AsyncActionResult {
    if (!deletedCustomerUndo) return { ok: false, message: "That customer could not be restored." };
    const snapshot = deletedCustomerUndo;
    clearDeletedCustomerUndo();
    if (isDynamoAdmin()) return applyAdminActionResult(await undoDeleteCustomerAction(snapshot));
    return applyPreviewMutation(undoDeleteCustomerOnHub(data, snapshot));
  }

  async function saveSeries(seriesId: string, input: SaveSeriesInput): AsyncActionResult {
    if (isDynamoAdmin()) return applyAdminActionResult(await saveSeriesAction(seriesId, input));
    return applyPreviewMutation(saveSeriesOnHub(data, seriesId, input));
  }

  async function updateCleanerAdmin(cleanerId: string, input: UpdateCleanerAdminInput): AsyncActionResult {
    if (isDynamoAdmin()) return applyAdminActionResult(await updateCleanerAdminAction(cleanerId, input));
    const outcome = updateCleanerAdminOnHub(data, cleanerId, input);
    if (!outcome.result.ok) return outcome.result;
    const { patch, remove } = hubMutationPatch(data, outcome.hub);
    applyAdminHubPatch(patch, remove);
    return { ok: true };
  }

  async function createJob(input: CreateJobInput): AsyncActionResult {
    if (isDynamoAdmin()) {
      staffingSaveInFlightRef.current = true;
      try {
        return applyAdminActionResult(await createJobAction(input));
      } finally {
        staffingSaveInFlightRef.current = false;
      }
    }
    const outcome = createJobOnHub(data, input, "kelsey");
    if (!outcome.ok) return outcome;
    const { patch, remove } = hubMutationPatch(data, outcome.hub);
    applyAdminHubPatch(patch, remove);
    return { ok: true, jobId: outcome.jobId, message: outcome.message };
  }

  async function saveCleanerDetails(input: SaveCleanerDetailsInput): AsyncActionResult {
    if (isDynamoAdmin()) return applyAdminActionResult(await saveCleanerDetailsAction(input));
    return applyPreviewMutation(saveCleanerDetailsOnHub(data, input));
  }

  async function staffCleaner(input: StaffCleanerInput): AsyncActionResult {
    if (isDynamoAdmin()) return applyAdminActionResult(await staffCleanerAction(input));
    return applyPreviewMutation(staffCleanerOnHub(data, input));
  }

  async function completeAssignment(input: CompleteAssignmentInput): AsyncActionResult {
    if (isDynamoAdmin()) {
      staffingSaveInFlightRef.current = true;
      try {
        return applyAdminActionResult(await completeAssignmentAction(input));
      } finally {
        staffingSaveInFlightRef.current = false;
      }
    }
    const outcome = completeAssignmentOnHub(data, input);
    if (!outcome.ok) return outcome;
    const { patch, remove } = hubMutationPatch(data, outcome.hub);
    applyAdminHubPatch(patch, remove);
    return {
      ok: true,
      jobId: outcome.jobId,
      message: outcome.message,
      assignmentId: outcome.assignmentId,
    };
  }

  async function runJobCleanerMutation(
    mutation: { jobId: string; cleanerId: string; op: "add" | "remove" },
    run: () => AsyncActionResult,
  ): AsyncActionResult {
    beginJobCleanerMutation(mutation);
    try {
      return await run();
    } finally {
      endJobCleanerMutation();
    }
  }

  async function addJobCleaner(jobId: string, cleanerId: string): AsyncActionResult {
    return runJobCleanerMutation({ jobId, cleanerId, op: "add" }, async () => {
      if (isDynamoAdmin()) return applyAdminJobStaffingResult(await addJobCleanerAction(jobId, cleanerId));
      return applyPreviewMutation(addJobCleanerOnHub(data, jobId, cleanerId));
    });
  }

  async function removeJobCleaner(jobId: string, cleanerId: string): AsyncActionResult {
    return runJobCleanerMutation({ jobId, cleanerId, op: "remove" }, async () => {
      const assignment = data.assignments.find(
        (item) =>
          item.jobId === jobId &&
          item.cleanerId === cleanerId &&
          item.status !== "CANCELED" &&
          item.status !== "EXPIRED_JOB_FILLED",
      );
      if (isDynamoAdmin()) {
        const result = await applyAdminJobStaffingResult(await removeJobCleanerAction(jobId, cleanerId));
        if (result.ok && assignment) scheduleAssignmentSmsLogPurge(assignment.assignmentId);
        return result;
      }
      return applyPreviewMutation(removeJobCleanerOnHub(data, jobId, cleanerId));
    });
  }

  async function updateVisit(input: UpdateVisitInput): AsyncActionResult {
    const removedAssignmentIds = assignmentIdsRemovedByVisitUpdate(data, input.jobId, input.cleanerIds);
    if (isDynamoAdmin()) {
      const result = await applyAdminActionResult(await updateVisitAction(input));
      if (result.ok) {
        for (const assignmentId of removedAssignmentIds) scheduleAssignmentSmsLogPurge(assignmentId);
      }
      return result;
    }
    return applyPreviewMutation(updateVisitOnHub(data, input));
  }

  async function updateJob(input: UpdateJobInput): AsyncActionResult {
    if (isDynamoAdmin()) return applyAdminActionResult(await updateJobAction(input));
    return applyPreviewMutation(updateJobOnHub(data, input));
  }

  async function moveAssignmentTime(
    assignmentId: string,
    arrivalWindowStart: string,
    arrivalWindowEnd: string,
  ): AsyncActionResult {
    if (isDynamoAdmin()) {
      return applyAdminActionResult(await moveAssignmentTimeAction(assignmentId, arrivalWindowStart, arrivalWindowEnd));
    }
    return applyPreviewMutation(moveAssignmentTimeOnHub(data, assignmentId, arrivalWindowStart, arrivalWindowEnd));
  }

  async function markAssignmentNotified(assignmentId: string): AsyncActionResult {
    if (isDynamoAdmin()) return applyAdminActionResult(await markAssignmentNotifiedAction(assignmentId));
    return applyPreviewMutation(markAssignmentNotifiedOnHub(data, assignmentId));
  }

  async function undoDeleteJob(): AsyncActionResult {
    if (!deletedJobUndo) return { ok: false, message: "That cleaning could not be restored." };
    const snapshot = deletedJobUndo;
    clearDeletedJobUndo();
    if (isDynamoAdmin()) return applyAdminActionResult(await undoDeleteJobAction(snapshot));
    return applyPreviewMutation(undoDeleteJobOnHub(data, snapshot));
  }

  async function deleteJob(jobId: string): AsyncActionResult {
    const snapshot = deletedJobSnapshotFromHub(data, jobId);
    if (isDynamoAdmin()) {
      const result = await applyAdminActionResult(await deleteJobAction(jobId));
      if (result.ok && snapshot) scheduleDeletedJobUndo(snapshot);
      return result;
    }
    const outcome = deleteJobOnHub(data, jobId);
    if (!outcome.ok) return outcome;
    if (snapshot) scheduleDeletedJobUndo(snapshot);
    return applyPreviewMutation(outcome);
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

  async function deleteSeries(seriesId: string): AsyncActionResult {
    if (isDynamoAdmin()) return applyAdminActionResult(await deleteSeriesAction(seriesId));
    return applyPreviewMutation(deleteSeriesOnHub(data, seriesId));
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
    saveContractorQuestionnaireDraft,
    submitContractorQuestionnaire,
    mergeAdminHub,
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
                  void undoDeleteJob().then((result) => {
                    if (result.message) setToast(result.message);
                  });
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
                  void undoDeleteCustomer().then((result) => {
                    if (result.message) setToast(result.message);
                  });
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

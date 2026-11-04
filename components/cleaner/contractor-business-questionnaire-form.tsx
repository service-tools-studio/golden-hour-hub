"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ContractorBusinessQuestionnaireReview } from "@/components/cleaner/contractor-business-questionnaire-review";
import { FieldLabelWithTooltip } from "@/components/ui/info-tooltip";
import { ButtonLoadingLabel, CautionNotice, DateInput, Field, PrimaryButton, SecondaryButton, fieldClass } from "@/components/ui";
import type {
  BusinessRegistrationStatus,
  BusinessStructure,
  ContractorBusinessQuestionnaire,
  ContractorQuestionnaireInput,
  GeneralLiabilityInsuranceStatus,
  HelperPaymentArrangement,
  InsuranceOregonCoverageStatus,
  QuestionnaireFieldErrors,
  TeamMemberWorkingRelationship,
  WorkersCompNoReason,
  WorkersCompStatus,
} from "@/lib/domain/contractor-questionnaire";
import {
  businessContactEmail,
  COI_ADDITIONAL_INSURED_ADDRESS,
  COI_ADDITIONAL_INSURED_LEGAL_NAME,
} from "@/lib/business-contact-email";
import {
  QUESTIONNAIRE_WIZARD_STEP_COUNT,
  QUESTIONNAIRE_WIZARD_STEP_TITLES,
  clearErrorsForWizardStep,
  firstWizardStepFieldWithError,
  questionnaireInputMatchesSubmitted,
  readStoredWizardStep,
  validateQuestionnaireWizardStep,
  wizardStepFieldKeys,
  writeStoredWizardStep,
  type QuestionnaireWizardStep,
} from "@/lib/domain/contractor-questionnaire-wizard";
import {
  emptyTeamMember,
  inputFromSavedState,
  questionnaireInputIsComplete,
  questionnaireUiVisibility,
} from "@/lib/domain/contractor-questionnaire";
import type { ContractorQuestionnaireSubmitAttestation } from "@/lib/domain/contractor-questionnaire-submission";
import {
  ELECTRONIC_SIGNATURE_CONSENT_TEXT,
  QUESTIONNAIRE_ACKNOWLEDGMENT_TEXT,
} from "@/lib/domain/contractor-questionnaire-submission";
import { US_STATE_OPTIONS } from "@/lib/domain/us-states";
import { formatPhoneInput } from "@/lib/format";
import {
  NextInsuranceOregonCoverageHelper,
  NextInsuranceRecommendationCard,
} from "@/components/cleaner/next-insurance-recommendation";

function RadioOption<T extends string | boolean>({
  name,
  value,
  current,
  label,
  onChange,
}: {
  name: string;
  value: T;
  current: T | "" | boolean | null;
  label: string;
  onChange: (value: T) => void;
}) {
  const selected = current === value;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      name={name}
      onClick={() => onChange(value)}
      className={`min-h-12 rounded-2xl px-3 text-left text-sm font-semibold leading-snug ${
        selected ? "bg-ink text-cream" : "bg-cream text-ink ring-1 ring-ink/10"
      }`}
    >
      {label}
    </button>
  );
}

function RadioGroup<T extends string | boolean>({
  name,
  value,
  options,
  onChange,
  error,
  fieldKey,
}: {
  name: string;
  value: T | "" | boolean | null;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  error?: string;
  fieldKey?: string;
}) {
  return (
    <div data-questionnaire-field={fieldKey} data-questionnaire-question={fieldKey} className={fieldKey ? "scroll-mt-24" : undefined}>
      <div className="grid gap-2" role="radiogroup" aria-invalid={Boolean(error)}>
        {options.map((option) => (
          <RadioOption
            key={String(option.value)}
            name={name}
            value={option.value}
            current={value}
            label={option.label}
            onChange={onChange}
          />
        ))}
      </div>
      {error ? (
        <span role="alert" className="mt-1.5 block text-sm font-semibold text-red-700">
          {error}
        </span>
      ) : null}
    </div>
  );
}

type DraftSaveResult = { ok: true; message: string } | { ok: false; message: string };

type SubmitResult =
  | { ok: true; message: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

type AttestationFieldErrors = {
  acknowledgmentAccepted?: string;
  electronicSignature?: string;
};

function snapshotInput(input: ContractorQuestionnaireInput): string {
  return JSON.stringify(input);
}

/** Wait after last edit before background save (keeps typing / field changes smooth on mobile). */
const AUTOSAVE_MS = 1500;

function MailIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M4 6h16v12H4z" strokeLinejoin="round" />
      <path d="m4 7 8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export type ContractorBusinessQuestionnaireFormHandle = {
  isDirty: () => boolean;
  isSaving: () => boolean;
  flushSave: () => Promise<boolean>;
};

export const ContractorBusinessQuestionnaireForm = forwardRef<
  ContractorBusinessQuestionnaireFormHandle,
  {
    initialDraft?: ContractorQuestionnaireInput;
    initialQuestionnaire?: ContractorBusinessQuestionnaire;
    savedAt?: string;
    onSaveDraft: (input: ContractorQuestionnaireInput) => Promise<DraftSaveResult>;
    onSubmit: (
      input: ContractorQuestionnaireInput,
      attestation: ContractorQuestionnaireSubmitAttestation,
    ) => Promise<SubmitResult>;
    onSubmitted?: () => void;
    onSavingChange?: (saving: boolean) => void;
    onDraftSaveError?: (message: string) => void;
    profileMobilePhone?: string;
    profileEmail?: string;
    cleanerId?: string;
  }
>(function ContractorBusinessQuestionnaireForm(
  {
    initialDraft,
    initialQuestionnaire,
    savedAt,
    onSaveDraft,
    onSubmit,
    onSubmitted,
    onSavingChange,
    onDraftSaveError,
    profileMobilePhone,
    profileEmail,
    cleanerId,
  },
  ref,
) {
  const baselineRef = useRef("");
  const formRef = useRef<ContractorQuestionnaireInput | null>(null);
  const savingRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileContact = useMemo(
    () => ({ mobilePhone: profileMobilePhone, email: profileEmail }),
    [profileMobilePhone, profileEmail],
  );
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ContractorQuestionnaireInput>(() => {
    const initial = inputFromSavedState(initialDraft, initialQuestionnaire, profileContact);
    baselineRef.current = snapshotInput(initial);
    formRef.current = initial;
    return initial;
  });
  const [errors, setErrors] = useState<QuestionnaireFieldErrors>({});
  const [attestationErrors, setAttestationErrors] = useState<AttestationFieldErrors>({});
  const [acknowledgmentAccepted, setAcknowledgmentAccepted] = useState(false);
  const [electronicSignature, setElectronicSignature] = useState("");
  const [submitPending, startSubmitTransition] = useTransition();
  const [step, setStep] = useState<QuestionnaireWizardStep>(() => readStoredWizardStep(cleanerId) ?? 1);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [returnToReviewAfterEdit, setReturnToReviewAfterEdit] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const submitLockRef = useRef(false);
  const stepAnnouncerRef = useRef<HTMLDivElement>(null);
  const stepContentRef = useRef<HTMLDivElement>(null);
  const savedIndicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formComplete = useMemo(() => questionnaireInputIsComplete(form), [form]);
  const unchangedFromSubmission = useMemo(
    () => questionnaireInputMatchesSubmitted(form, initialQuestionnaire),
    [form, initialQuestionnaire],
  );
  const hasW2TeamMember = useMemo(
    () => form.teamMembers.some((member) => member.workingRelationship === "EMPLOYEE"),
    [form.teamMembers],
  );
  const canSubmit =
    formComplete && acknowledgmentAccepted && electronicSignature.trim().length > 0 && !saving && !submitPending;

  formRef.current = form;

  const externalFormSnapshot = useMemo(
    () => snapshotInput(inputFromSavedState(initialDraft, initialQuestionnaire, profileContact)),
    [savedAt, initialDraft, initialQuestionnaire, profileContact],
  );

  useEffect(() => {
    const current = formRef.current;
    if (current && snapshotInput(current) !== baselineRef.current) {
      return;
    }
    if (externalFormSnapshot === baselineRef.current) {
      return;
    }
    const initial = inputFromSavedState(initialDraft, initialQuestionnaire, profileContact);
    baselineRef.current = externalFormSnapshot;
    formRef.current = initial;
    setForm(initial);
    setErrors({});
  }, [externalFormSnapshot, initialDraft, initialQuestionnaire, profileContact]);

  function setSavingState(next: boolean) {
    savingRef.current = next;
    setSaving(next);
    onSavingChange?.(next);
    if (next) {
      setSaveStatus("saving");
    }
  }

  useEffect(() => {
    writeStoredWizardStep(cleanerId, step);
  }, [cleanerId, step]);

  useEffect(() => {
    if (saving) return;
    if (snapshotInput(form) === baselineRef.current) {
      if (saveStatus === "saving") setSaveStatus("saved");
    }
  }, [saving, form, saveStatus]);

  useEffect(() => {
    if (saveStatus !== "saved") return;
    if (savedIndicatorTimerRef.current) clearTimeout(savedIndicatorTimerRef.current);
    savedIndicatorTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2500);
    return () => {
      if (savedIndicatorTimerRef.current) clearTimeout(savedIndicatorTimerRef.current);
    };
  }, [saveStatus]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [step]);

  function goToStep(next: QuestionnaireWizardStep) {
    setStep(next);
    stepAnnouncerRef.current?.focus();
  }

  const SCROLL_TOP_PADDING_PX = 72;
/** Room for sticky step nav + safe area so error text is not hidden. */
const SCROLL_BOTTOM_PADDING_PX = 148;

function scrollQuestionBlockIntoView(target: HTMLElement): void {
  const rect = target.getBoundingClientRect();
  const docTop = rect.top + window.scrollY;
  const docBottom = rect.bottom + window.scrollY;
  let nextScrollY = window.scrollY;

  if (rect.top < SCROLL_TOP_PADDING_PX) {
    nextScrollY = docTop - SCROLL_TOP_PADDING_PX;
  } else if (rect.bottom > window.innerHeight - SCROLL_BOTTOM_PADDING_PX) {
    nextScrollY = docBottom - (window.innerHeight - SCROLL_BOTTOM_PADDING_PX);
  }

  window.scrollTo({ top: Math.max(0, nextScrollY), behavior: "smooth" });
}

function scrollToFirstStepError(stepErrors: QuestionnaireFieldErrors, wizardStep: QuestionnaireWizardStep) {
  const firstKey = firstWizardStepFieldWithError(wizardStep, stepErrors);
  if (!firstKey) return;
  const scrollKey =
    firstKey === "businessCity" || firstKey === "businessState" || firstKey === "businessZip"
      ? "businessStreetAddress"
      : firstKey;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const root = stepContentRef.current;
      const el =
        root?.querySelector(`[data-questionnaire-question="${scrollKey}"]`) ??
        root?.querySelector(`[data-questionnaire-field="${scrollKey}"]`);
      if (!(el instanceof HTMLElement)) return;
      scrollQuestionBlockIntoView(el);
      const focusable = el.querySelector<HTMLElement>(
        "input:not([type=\"hidden\"]), select, textarea, button[role=\"radio\"]",
      );
      focusable?.focus({ preventScroll: true });
    });
  });
}

  async function handleContinue(): Promise<void> {
    const current = formRef.current;
    if (!current) return;
    const stepErrors = validateQuestionnaireWizardStep(step, current);
    if (Object.keys(stepErrors).length > 0) {
      setErrors((prev) => ({ ...clearErrorsForWizardStep(step, prev), ...stepErrors }));
      scrollToFirstStepError(stepErrors, step);
      return;
    }
    setErrors((prev) => clearErrorsForWizardStep(step, prev));
    const saved = await flushSave();
    if (!saved) return;
    if (step === 3) {
      setReturnToReviewAfterEdit(false);
      goToStep(4);
      return;
    }
    if (step < 3) goToStep((step + 1) as QuestionnaireWizardStep);
  }

  function handleBackToReview() {
    void flushSave().then((ok) => {
      if (!ok) return;
      setReturnToReviewAfterEdit(false);
      goToStep(4);
    });
  }

  function handleBack() {
    if (step === 1) return;
    if (step === 4) {
      goToStep(3);
      return;
    }
    goToStep((step - 1) as QuestionnaireWizardStep);
  }

  function handleEditFromReview(editStep: QuestionnaireWizardStep) {
    setReturnToReviewAfterEdit(true);
    goToStep(editStep);
  }

  type DraftSaveMode = "foreground" | "background";

  function tryDebouncedAutosave() {
    debounceTimerRef.current = null;
    const current = formRef.current;
    if (!current || snapshotInput(current) === baselineRef.current) return;

    const root = stepContentRef.current;
    const active = document.activeElement;
    if (
      root &&
      active instanceof HTMLElement &&
      root.contains(active) &&
      (active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        active.getAttribute("role") === "radio")
    ) {
      debounceTimerRef.current = setTimeout(tryDebouncedAutosave, 350);
      return;
    }

    void runDraftSave("background");
  }

  function scheduleDebouncedAutosave() {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(tryDebouncedAutosave, AUTOSAVE_MS);
  }

  async function runDraftSave(mode: DraftSaveMode = "foreground"): Promise<boolean> {
    const current = formRef.current;
    if (!current || snapshotInput(current) === baselineRef.current) return true;
    if (savingRef.current) return false;
    const snapshotAtStart = snapshotInput(current);
    savingRef.current = true;
    if (mode === "foreground") {
      setSavingState(true);
    } else {
      setSaveStatus("saving");
    }
    try {
      const result = await onSaveDraft(current);
      if (!result.ok) {
        onDraftSaveError?.(result.message);
        setSaveStatus("error");
        return false;
      }
      baselineRef.current = snapshotAtStart;
      setSaveStatus("saved");
      return true;
    } finally {
      savingRef.current = false;
      if (mode === "foreground") {
        setSaving(false);
        onSavingChange?.(false);
      }
    }
  }

  async function flushSave(): Promise<boolean> {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    while (savingRef.current) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const current = formRef.current;
    if (!current || snapshotInput(current) === baselineRef.current) return true;
    return runDraftSave("foreground");
  }

  useImperativeHandle(ref, () => ({
    isDirty: () => {
      const current = formRef.current;
      if (!current) return false;
      return snapshotInput(current) !== baselineRef.current;
    },
    isSaving: () => savingRef.current,
    flushSave,
  }));

  useEffect(() => {
    const stepValidation = validateQuestionnaireWizardStep(step, form);
    setErrors((prev) => {
      let next: QuestionnaireFieldErrors | undefined;
      for (const key of wizardStepFieldKeys(step)) {
        if (prev[key] && !stepValidation[key]) {
          if (!next) next = { ...prev };
          delete next[key];
        }
      }
      return next ?? prev;
    });
  }, [form, step]);

  const visibility = questionnaireUiVisibility(form);
  const coiContactEmail = useMemo(() => businessContactEmail(), []);
  const businessAddressHint = useMemo(() => {
    if (form.registrationStatus === "SOLE_PROPRIETOR") {
      return "Enter the address you use for your cleaning business.";
    }
    if (form.registrationStatus === "LLC_OR_CORP") {
      return "Enter the business address listed on your official state registration. This should match the address on file with the Secretary of State or the agency where your business is registered. An Oregon address is not required.";
    }
    return undefined;
  }, [form.registrationStatus]);

  function patch(partial: Partial<ContractorQuestionnaireInput>) {
    setForm((current) => {
      const next = { ...current, ...partial };
      formRef.current = next;
      return next;
    });
    const current = formRef.current;
    if (current && snapshotInput(current) !== baselineRef.current) {
      scheduleDebouncedAutosave();
    }
  }

  function handleSubmit() {
    if (submitLockRef.current || submitPending) return;
    startSubmitTransition(async () => {
      if (submitLockRef.current) return;
      submitLockRef.current = true;
      try {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        while (savingRef.current) {
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        const current = formRef.current;
        if (!current) return;
        if (unchangedFromSubmission) return;
        if (snapshotInput(current) !== baselineRef.current) {
          const draftOk = await runDraftSave();
          if (!draftOk) return;
        }
        const result = await onSubmit(current, {
          acknowledgmentAccepted,
          electronicSignature,
        });
        if (!result.ok) {
          if (result.fieldErrors) {
            setErrors(result.fieldErrors);
            setAttestationErrors({
              acknowledgmentAccepted: result.fieldErrors.acknowledgmentAccepted,
              electronicSignature: result.fieldErrors.electronicSignature,
            });
          }
          goToStep(4);
          return;
        }
        setErrors({});
        setAttestationErrors({});
        setAcknowledgmentAccepted(false);
        setElectronicSignature("");
        baselineRef.current = snapshotInput(current);
        setSubmitSuccess(true);
        writeStoredWizardStep(cleanerId, 1);
        onSubmitted?.();
      } finally {
        submitLockRef.current = false;
      }
    });
  }

  const stepTitle = QUESTIONNAIRE_WIZARD_STEP_TITLES[step - 1];
  const saveStatusLabel =
    saveStatus === "saving"
      ? "Saving…"
      : saveStatus === "saved"
        ? "Saved"
        : saveStatus === "error"
          ? "Save failed — try again"
          : null;

  if (submitSuccess) {
    return (
      <div className="space-y-6 pb-8 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">Your business information has been submitted!</h2>
        <p className="text-base leading-relaxed text-ink/70">
          Thank you for keeping your information up to date. Golden Hour Cleaning Co will review your submission and
          reach out if anything else is needed.
        </p>
        <Link
          href="/cleaner"
          className="mx-auto flex min-h-12 w-full max-w-sm items-center justify-center rounded-2xl bg-ink px-4 text-base font-semibold text-cream"
        >
          Back to Hub
        </Link>
      </div>
    );
  }

  return (
    <div className="pb-36" aria-busy={saving || submitPending}>
      <div className="space-y-3" tabIndex={-1}>
        <div className="flex items-center justify-between gap-3 text-sm text-ink/65">
          <p>
            Step {step} of {QUESTIONNAIRE_WIZARD_STEP_COUNT}
          </p>
          {saveStatusLabel ? (
            <p className="font-medium text-ink/70" role="status" aria-live="polite">
              {saveStatusLabel}
            </p>
          ) : null}
        </div>
        <div className="flex gap-1" aria-hidden="true">
          {QUESTIONNAIRE_WIZARD_STEP_TITLES.map((_, index) => (
            <div
              key={index}
              className={`h-1.5 flex-1 rounded-full ${index + 1 <= step ? "bg-ink" : "bg-ink/15"}`}
            />
          ))}
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-ink">{stepTitle}</h2>
        <div ref={stepAnnouncerRef} tabIndex={-1} className="sr-only" aria-live="polite">
          Step {step}: {stepTitle}
        </div>
      </div>

      <div className="mt-6 space-y-8" ref={stepContentRef}>
      {step === 1 ? (
      <>
      <CautionNotice>
        <p className="font-semibold text-ink">For the Business Owner</p>
        <p>
          This form must be completed by the owner of the cleaning business. Please answer the questions from your own
          perspective as the business owner.
        </p>
        <p>
          When we ask about people who may work with you on Golden Hour Cleaning Co jobs, include everyone who helps
          perform cleaning services besides yourself — including your spouse, partner, family members,
          employees, or occasional helpers.
        </p>
      </CautionNotice>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">About your cleaning business</h2>
          <p className="mt-1 text-sm text-ink/65">
            Tell us a little about your business so we can keep our records accurate.
          </p>
        </div>

        <Field label="What is your cleaning business called?" error={errors.businessDisplayName} questionnaireField="businessDisplayName">
          <input
            className={fieldClass}
            value={form.businessDisplayName}
            placeholder="for example: Golden Hour Cleaning Co."
            onChange={(event) => patch({ businessDisplayName: event.target.value })}
          />
        </Field>

        <Field
          label={
            <FieldLabelWithTooltip
              label="What is the full legal name of the business owner?"
              tooltip="Enter the owner's first and last name as shown on a government-issued ID."
            />
          }
          error={errors.ownerLegalName}
          questionnaireField="ownerLegalName"
        >
          <input
            className={fieldClass}
            value={form.ownerLegalName}
            placeholder="First and last name"
            onChange={(event) => patch({ ownerLegalName: event.target.value })}
          />
        </Field>

        <div data-questionnaire-field="registrationStatus" data-questionnaire-question="registrationStatus" className="scroll-mt-24">
          <FieldLabelWithTooltip
            label="Is your business registered as an LLC or corporation?"
            tooltip="We're asking how your business is legally set up, not whether you have a business name, EIN, or Google Business Profile."
          />
          <div className="mt-2">
            <RadioGroup<BusinessRegistrationStatus>
              name="registrationStatus"
              value={form.registrationStatus}
              error={errors.registrationStatus}
              onChange={(registrationStatus) => patch({ registrationStatus })}
              options={[
                { value: "LLC_OR_CORP", label: "Yes" },
                { value: "SOLE_PROPRIETOR", label: "No, I work as a sole proprietor" },
              ]}
            />
          </div>
        </div>

        {visibility.showRegistrationDetails ? (
          <div className="space-y-4 rounded-2xl bg-cream/60 p-4 ring-1 ring-ink/8">
            <div data-questionnaire-field="businessStructure" data-questionnaire-question="businessStructure" className="scroll-mt-24">
              <p className="text-sm font-medium text-ink/80">What type of business is it?</p>
              <div className="mt-2">
                <RadioGroup<BusinessStructure>
                  name="businessStructure"
                  value={form.businessStructure}
                  error={errors.businessStructure}
                  onChange={(businessStructure) => patch({ businessStructure })}
                  options={[
                    { value: "LLC_SINGLE", label: "LLC with one owner" },
                    { value: "LLC_MULTI", label: "LLC with two or more owners" },
                    { value: "CORPORATION", label: "Corporation" },
                  ]}
                />
              </div>
            </div>
            <Field label="What is the legal name of your registered business?" error={errors.registeredLegalName} questionnaireField="registeredLegalName">
              <input
                className={fieldClass}
                value={form.registeredLegalName}
                placeholder="for example: Heart Aligned Wellness LLC"
                onChange={(event) => patch({ registeredLegalName: event.target.value })}
              />
            </Field>
            <Field label="What state is your business registered in?" error={errors.registrationState} questionnaireField="registrationState">
              <select
                className={fieldClass}
                value={form.registrationState}
                onChange={(event) => patch({ registrationState: event.target.value })}
              >
                <option value="">Select a state</option>
                {US_STATE_OPTIONS.map((state) => (
                  <option key={state.value} value={state.value}>
                    {state.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={
                <FieldLabelWithTooltip
                  label="What is your state business registration number?"
                  tooltip="This is the number your state assigned when your LLC or corporation was registered. It may be called a Registry Number, UBI Number, or Filing ID. You can usually find it on your business registration paperwork or through your state's business registry. This is not your EIN or tax ID."
                />
              }
              error={errors.stateRegistrationNumber}
              questionnaireField="stateRegistrationNumber"
            >
              <input
                className={fieldClass}
                value={form.stateRegistrationNumber}
                placeholder="for example: 1234567-89"
                autoComplete="off"
                onChange={(event) => patch({ stateRegistrationNumber: event.target.value })}
              />
            </Field>
          </div>
        ) : null}

        <Field
          label="What is your business address?"
          hint={businessAddressHint}
          error={errors.businessStreetAddress || errors.businessCity || errors.businessState || errors.businessZip}
          questionnaireField="businessStreetAddress"
        >
          <div className="space-y-2">
            <input
              className={fieldClass}
              value={form.businessStreetAddress}
              placeholder="Street address"
              onChange={(event) => patch({ businessStreetAddress: event.target.value })}
            />
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                className={fieldClass}
                value={form.businessCity}
                placeholder="City"
                data-questionnaire-field="businessCity"
                onChange={(event) => patch({ businessCity: event.target.value })}
                aria-invalid={Boolean(errors.businessCity)}
              />
              <select
                className={fieldClass}
                value={form.businessState}
                data-questionnaire-field="businessState"
                onChange={(event) => patch({ businessState: event.target.value })}
                aria-invalid={Boolean(errors.businessState)}
              >
                <option value="">State</option>
                {US_STATE_OPTIONS.map((state) => (
                  <option key={state.value} value={state.value}>
                    {state.label}
                  </option>
                ))}
              </select>
              <input
                className={fieldClass}
                value={form.businessZip}
                placeholder="ZIP"
                inputMode="numeric"
                data-questionnaire-field="businessZip"
                onChange={(event) => patch({ businessZip: event.target.value })}
                aria-invalid={Boolean(errors.businessZip)}
              />
            </div>
          </div>
        </Field>

        <Field label="Business phone number" error={errors.businessPhone} questionnaireField="businessPhone">
          <input
            className={fieldClass}
            type="tel"
            inputMode="tel"
            value={formatPhoneInput(form.businessPhone)}
            placeholder="(503) 555-0123"
            onChange={(event) => patch({ businessPhone: formatPhoneInput(event.target.value, form.businessPhone) })}
          />
        </Field>

        <Field label="Business email address" error={errors.businessEmail} questionnaireField="businessEmail">
          <input
            className={fieldClass}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={form.businessEmail}
            placeholder="golden.hour.cleaning.company@gmail.com"
            onChange={(event) => patch({ businessEmail: event.target.value })}
          />
        </Field>
      </section>
      </>
      ) : null}

      {step === 2 ? (
      <>
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Who works with you?</h2>
        </div>

        <Field
          label="Besides yourself, will anyone else perform cleaning services for Golden Hour Cleaning Co through your business?"
          hint="Include anyone you will be cleaning with on a Golden Hour Cleaning Co job—such as your spouse, partner, family members, employees, or occasional helpers."
          error={errors.hasAdditionalWorkers as string | undefined}
          questionnaireField="hasAdditionalWorkers"
        >
          <RadioGroup<boolean>
            name="hasAdditionalWorkers"
            value={form.hasAdditionalWorkers}
            error={errors.hasAdditionalWorkers as string | undefined}
            onChange={(hasAdditionalWorkers) => patch({ hasAdditionalWorkers })}
            options={[
              { value: false, label: "No, I will be the only person performing Golden Hour Cleaning Co jobs." },
              {
                value: true,
                label: "Yes, one or more other people may perform Golden Hour Cleaning Co jobs through my business.",
              },
            ]}
          />
        </Field>

        {visibility.showTeamSection ? (
          <div className="space-y-4 rounded-2xl bg-cream/60 p-4 ring-1 ring-ink/8">
            <Field
              label="List each person besides yourself who may perform Golden Hour Cleaning Co jobs through your business."
              error={errors.teamMembers}
              questionnaireField="teamMembers"
            >
              <div className="mt-3 space-y-4">
                {form.teamMembers.map((member, index) => {
                  const firstNameLabel = member.firstName.trim() || "this person";
                  return (
                    <div key={index} className="space-y-3 rounded-2xl bg-white p-3 ring-1 ring-ink/10">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                        <input
                          className={fieldClass}
                          placeholder="First name"
                          value={member.firstName}
                          onChange={(event) => {
                            const teamMembers = [...form.teamMembers];
                            teamMembers[index] = { ...teamMembers[index], firstName: event.target.value };
                            patch({ teamMembers });
                          }}
                        />
                        <input
                          className={fieldClass}
                          placeholder="Last name"
                          value={member.lastName}
                          onChange={(event) => {
                            const teamMembers = [...form.teamMembers];
                            teamMembers[index] = { ...teamMembers[index], lastName: event.target.value };
                            patch({ teamMembers });
                          }}
                        />
                        {form.teamMembers.length > 1 ? (
                          <button
                            type="button"
                            className="min-h-12 shrink-0 rounded-2xl px-4 text-sm font-semibold text-ink/70 ring-1 ring-ink/15"
                            onClick={() => {
                              patch({ teamMembers: form.teamMembers.filter((_, row) => row !== index) });
                            }}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                      <div>
                        <FieldLabelWithTooltip
                          label={`What is ${firstNameLabel}'s working relationship with your business?`}
                          tooltip="An employee works for your business and receives wages. A self-employed cleaner operates their own business and provides services to yours. A co-owner shares legal ownership of your business. If you're unsure, select that option."
                        />
                        <div className="mt-2">
                          <RadioGroup<TeamMemberWorkingRelationship>
                            name={`teamMemberRelationship-${index}`}
                            value={member.workingRelationship ?? ""}
                            onChange={(workingRelationship) => {
                              const teamMembers = [...form.teamMembers];
                              teamMembers[index] = {
                                ...teamMembers[index],
                                workingRelationship,
                                workingRelationshipOther:
                                  workingRelationship === "OTHER" ? teamMembers[index].workingRelationshipOther : "",
                              };
                              patch({ teamMembers });
                            }}
                            options={[
                              { value: "EMPLOYEE", label: "They are my W-2 employee" },
                              {
                                value: "CONTRACTOR_1099",
                                label: "They operate their own cleaning business and I hire them to help (1099 independent contractor)",
                              },
                              { value: "CO_OWNER", label: "They are a registered co-owner of my business" },
                              { value: "UNSURE", label: "They help me, but I'm not sure how they're classified" },
                              { value: "OTHER", label: "Other (please explain)" },
                            ]}
                          />
                        </div>
                        {member.workingRelationship === "OTHER" ? (
                          <Field label="Please explain" hint="">
                            <input
                              className={fieldClass}
                              value={member.workingRelationshipOther ?? ""}
                              onChange={(event) => {
                                const teamMembers = [...form.teamMembers];
                                teamMembers[index] = {
                                  ...teamMembers[index],
                                  workingRelationshipOther: event.target.value,
                                };
                                patch({ teamMembers });
                              }}
                            />
                          </Field>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Field>
            <button
              type="button"
              className="min-h-11 rounded-2xl bg-white px-4 text-sm font-semibold ring-1 ring-ink/15"
              onClick={() => patch({ teamMembers: [...form.teamMembers, emptyTeamMember()] })}
            >
              Add another person
            </button>

            <CautionNotice>
              <span className="font-semibold text-ink">Note: </span>
              You must update this list and receive approval from Golden Hour Cleaning Co before bringing any new person to a
              Golden Hour Cleaning Co cleaning appointment.
            </CautionNotice>
          </div>
        ) : null}
      </section>

      {visibility.showTeamSection ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Paying your team</h2>
          </div>
          <div
            data-questionnaire-field="helperPaymentArrangement"
            data-questionnaire-question="helperPaymentArrangement"
            className="scroll-mt-24"
          >
            <FieldLabelWithTooltip
              label="How do you pay the other people who perform cleaning services for your business?"
              tooltip="This helps us understand who is responsible for paying each person who performs cleaning services besides you."
            />
            <div className="mt-2">
              <RadioGroup<HelperPaymentArrangement>
                name="helperPaymentArrangement"
                value={form.helperPaymentArrangement}
                error={errors.helperPaymentArrangement}
                onChange={(helperPaymentArrangement) => patch({ helperPaymentArrangement })}
                options={[
                  { value: "BUSINESS_PAYS", label: "I pay them through my business" },
                  { value: "GOLDEN_HOUR_PAYS", label: "Golden Hour Cleaning Co pays them directly" },
                  { value: "VARIES", label: "It varies" },
                  { value: "UNSURE", label: "I'm not sure" },
                ]}
              />
            </div>
          </div>
        </section>
      ) : null}
      </>
      ) : null}

      {step === 3 ? (
      <>
      {visibility.showWorkersCompSection ? (
          <div className="space-y-4 rounded-2xl bg-cream/60 p-4 ring-1 ring-ink/8">
            <h3 className="text-base font-semibold text-ink">Workers&apos; compensation</h3>
            <div data-questionnaire-field="workersCompStatus" data-questionnaire-question="workersCompStatus" className="scroll-mt-24">
              <FieldLabelWithTooltip
                label="Does your business have workers' compensation insurance?"
                tooltip="Workers' compensation is insurance that can help cover medical bills and lost wages if someone gets hurt while working. It's different from general liability insurance."
              />
              <div className="mt-2">
                <RadioGroup<WorkersCompStatus>
                  name="workersCompStatus"
                  value={form.workersCompStatus}
                  error={errors.workersCompStatus}
                  onChange={(workersCompStatus) => patch({ workersCompStatus })}
                  options={[
                    { value: "YES", label: "Yes" },
                    { value: "NO", label: "No" },
                    { value: "UNSURE", label: "I'm not sure" },
                  ]}
                />
              </div>
            </div>

            {visibility.showWorkersCompReason ? (
              <div data-questionnaire-field="workersCompNoReason" data-questionnaire-question="workersCompNoReason" className="scroll-mt-24">
                <FieldLabelWithTooltip
                  label="Which best describes why your business does not have workers' compensation insurance?"
                  tooltip="We're gathering information to help Golden Hour review your business. You are not being asked to determine your own legal exemption."
                />
                <p className="mt-1 text-sm leading-relaxed text-ink/65">
                  Workers&apos; compensation requirements depend on your business structure and working relationships.
                  Even if someone receives a 1099 rather than a W-2, workers&apos; compensation may still be required.
                </p>
                <div className="mt-2">
                  <RadioGroup<WorkersCompNoReason>
                    name="workersCompNoReason"
                    value={form.workersCompNoReason}
                    error={errors.workersCompNoReason}
                    onChange={(workersCompNoReason) => patch({ workersCompNoReason })}
                    options={[
                      ...(form.hasAdditionalWorkers === false
                        ? [{ value: "WORK_ALONE" as const, label: "I work alone and have no employees or helpers." }]
                        : []),
                      { value: "OWNERS_ONLY", label: "Only business owners perform cleaning services." },
                      {
                        value: "CONTRACTORS_1099",
                        label: "I work with independent subcontractors who operate their own businesses.",
                      },
                      { value: "HELPERS_NOT_W2", label: "I have helpers, but they are not W-2 employees." },
                      { value: "OBTAINING_COVERAGE", label: "I'm in the process of obtaining coverage." },
                      { value: "UNSURE_NEED", label: "I'm not sure whether my business needs coverage." },
                      { value: "OTHER", label: "Other (please explain)." },
                    ]}
                  />
                </div>
                {visibility.showWorkersCompOther ? (
                  <Field label="Please explain" error={errors.workersCompNoReasonOther} hint="" questionnaireField="workersCompNoReasonOther">
                    <input
                      className={fieldClass}
                      value={form.workersCompNoReasonOther}
                      onChange={(event) => patch({ workersCompNoReasonOther: event.target.value })}
                    />
                  </Field>
                ) : null}
              </div>
            ) : null}

            {visibility.showWorkersCompPolicyDetails ? (
              <div className="space-y-4">
                <Field label="Insurance carrier" error={errors.workersCompCarrierName} questionnaireField="workersCompCarrierName">
                  <input
                    className={fieldClass}
                    value={form.workersCompCarrierName}
                    onChange={(event) => patch({ workersCompCarrierName: event.target.value })}
                  />
                </Field>
                <Field label="Policy number" error={errors.workersCompPolicyNumber} questionnaireField="workersCompPolicyNumber">
                  <input
                    className={fieldClass}
                    value={form.workersCompPolicyNumber}
                    onChange={(event) => patch({ workersCompPolicyNumber: event.target.value })}
                  />
                </Field>
                <Field label="Policy expiration date" error={errors.workersCompExpirationDate} questionnaireField="workersCompExpirationDate">
                  <DateInput
                    className={fieldClass}
                    value={form.workersCompExpirationDate}
                    onValueChange={(workersCompExpirationDate) => patch({ workersCompExpirationDate })}
                  />
                </Field>
              </div>
            ) : null}
          </div>
        ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">General liability insurance</h2>
          <p className="mt-1 text-sm text-ink/65">
            Help us keep your insurance information up to date so we can continue scheduling jobs together.
          </p>
        </div>

        <div data-questionnaire-field="generalLiabilityStatus" data-questionnaire-question="generalLiabilityStatus" className="scroll-mt-24">
          <FieldLabelWithTooltip
            label="Does your cleaning business have general liability insurance?"
            tooltip="General liability insurance helps protect your business if you accidentally damage a customer's property or cause certain injuries while working."
          />
          <div className="mt-2">
            <RadioGroup<GeneralLiabilityInsuranceStatus>
              name="generalLiabilityStatus"
              value={form.generalLiabilityStatus}
              error={errors.generalLiabilityStatus}
              onChange={(generalLiabilityStatus) => patch({ generalLiabilityStatus })}
              options={[
                { value: "YES", label: "Yes" },
                { value: "NO", label: "No" },
                { value: "IN_PROGRESS", label: "I'm in the process of getting insured" },
              ]}
            />
          </div>
          {form.generalLiabilityStatus === "NO" || form.generalLiabilityStatus === "IN_PROGRESS" ? (
            <NextInsuranceRecommendationCard />
          ) : null}
        </div>

        {visibility.showInsuranceDetails ? (
          <div className="space-y-4 rounded-2xl bg-cream/60 p-4 ring-1 ring-ink/8">
            <Field label="What insurance company do you use?" error={errors.insuranceProviderName} questionnaireField="insuranceProviderName">
              <input
                className={fieldClass}
                value={form.insuranceProviderName}
                placeholder="for example: NEXT Insurance"
                onChange={(event) => patch({ insuranceProviderName: event.target.value })}
              />
            </Field>
            <Field label="When does your insurance expire?" error={errors.insuranceExpirationDate} questionnaireField="insuranceExpirationDate">
              <DateInput
                className={fieldClass}
                value={form.insuranceExpirationDate}
                onValueChange={(insuranceExpirationDate) => patch({ insuranceExpirationDate })}
              />
            </Field>
            <div data-questionnaire-field="insuranceOregonCoverage" data-questionnaire-question="insuranceOregonCoverage" className="scroll-mt-24">
              <FieldLabelWithTooltip
                label="Does your policy cover cleaning jobs in Oregon?"
                tooltip="If you're unsure, contact your insurance company and ask whether your policy covers the cleaning services you perform in Oregon."
              />
              <div className="mt-2">
                <RadioGroup<InsuranceOregonCoverageStatus>
                  name="insuranceOregonCoverage"
                  value={form.insuranceOregonCoverage}
                  error={errors.insuranceOregonCoverage}
                  onChange={(insuranceOregonCoverage) => patch({ insuranceOregonCoverage })}
                  options={[
                    { value: "YES", label: "Yes" },
                    { value: "NO", label: "No" },
                    { value: "UNSURE", label: "I'm not sure" },
                  ]}
                />
              </div>
              {form.insuranceOregonCoverage === "NO" || form.insuranceOregonCoverage === "UNSURE" ? (
                <NextInsuranceOregonCoverageHelper />
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="flex gap-3 rounded-2xl bg-cream/80 p-4 ring-1 ring-ink/8">
          <MailIcon className="mt-0.5 shrink-0 text-ink/55" />
          <div className="min-w-0 space-y-3 text-sm text-ink/75">
            <p className="font-semibold text-ink">Proof of insurance</p>
            <p className="leading-snug">
              Email your Certificate of Insurance (COI) so we can verify coverage before approving you for scheduling.
            </p>
            {hasW2TeamMember ? (
              <p className="leading-snug">
                You listed a W-2 employee on your team. Workers&apos; compensation insurance is required as well—email
                proof of workers&apos; comp when you send your COI.
              </p>
            ) : null}
            <div className="rounded-xl bg-white/80 px-3 py-2.5 ring-1 ring-ink/8">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/50">
                List on the certificate as additional insured
              </p>
              <p className="mt-1.5 font-medium leading-snug text-ink">{COI_ADDITIONAL_INSURED_LEGAL_NAME}</p>
              <p className="mt-1 leading-snug text-ink/80">{COI_ADDITIONAL_INSURED_ADDRESS}</p>
            </div>
            <div className="rounded-xl bg-white/80 px-3 py-2.5 ring-1 ring-ink/8">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/50">Send to</p>
              <a
                className="mt-1 block break-all font-semibold text-ink underline"
                href={`mailto:${coiContactEmail}`}
              >
                {coiContactEmail}
              </a>
            </div>
          </div>
        </div>
      </section>
      </>
      ) : null}

      {step === 4 ? (
      <>
        <ContractorBusinessQuestionnaireReview form={form} onEditStep={handleEditFromReview} />
        {unchangedFromSubmission ? (
          <CautionNotice>
            <p>
              Your answers match your last submission. Update something above if you need to send changes—or you can
              leave this form without submitting again.
            </p>
          </CautionNotice>
        ) : null}
      <section className="space-y-4 rounded-2xl bg-cream/60 p-4 ring-1 ring-ink/8">
        <h2 className="text-lg font-semibold text-ink">Acknowledgment and signature</h2>
        <label className="flex gap-3 text-sm leading-snug text-ink/80">
          <input
            type="checkbox"
            className="mt-1 size-5 shrink-0 rounded border-ink/20"
            checked={acknowledgmentAccepted}
            onChange={(event) => {
              setAcknowledgmentAccepted(event.target.checked);
              setAttestationErrors((current) => ({ ...current, acknowledgmentAccepted: undefined }));
            }}
          />
          <span>{QUESTIONNAIRE_ACKNOWLEDGMENT_TEXT}</span>
        </label>
        {attestationErrors.acknowledgmentAccepted ? (
          <span role="alert" className="block text-sm font-semibold text-red-700">
            {attestationErrors.acknowledgmentAccepted}
          </span>
        ) : null}
        <Field
          label="Type your full legal name to sign electronically"
          hint={ELECTRONIC_SIGNATURE_CONSENT_TEXT}
          error={attestationErrors.electronicSignature}
        >
          <input
            className={fieldClass}
            value={electronicSignature}
            autoComplete="off"
            placeholder="First and last name"
            onChange={(event) => {
              setElectronicSignature(event.target.value);
              setAttestationErrors((current) => ({ ...current, electronicSignature: undefined }));
            }}
          />
        </Field>
      </section>
      </>
      ) : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink/10 bg-cream/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-md flex-col gap-2">
          {returnToReviewAfterEdit && step < 4 ? (
            <SecondaryButton type="button" onClick={handleBackToReview}>
              Back to review
            </SecondaryButton>
          ) : null}
          <div className={`flex gap-2 ${step > 1 ? "" : ""}`}>
            {step > 1 ? (
              <div className="flex-1">
                <SecondaryButton type="button" onClick={handleBack} disabled={submitPending}>
                  Back
                </SecondaryButton>
              </div>
            ) : null}
            {step < 4 ? (
              <div className={step > 1 ? "flex-1" : "w-full"}>
                <PrimaryButton type="button" onClick={() => void handleContinue()} disabled={saving}>
                  Continue
                </PrimaryButton>
              </div>
            ) : (
              <div className="w-full">
                <PrimaryButton
                  type="button"
                  loading={submitPending}
                  loadingLabel="Submitting…"
                  disabled={!canSubmit || unchangedFromSubmission}
                  onClick={handleSubmit}
                >
                  Sign &amp; Submit
                </PrimaryButton>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

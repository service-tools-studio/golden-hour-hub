"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useHub } from "@/components/hub-provider";
import {
  ContractorBusinessQuestionnaireForm,
  type ContractorBusinessQuestionnaireFormHandle,
} from "@/components/cleaner/contractor-business-questionnaire-form";
import { useHubSyncBlocker } from "@/components/hub-sync";
import { PendingNavigationOverlay, useUnsavedNavigation } from "@/components/unsaved-changes";
import { ButtonLoadingLabel, PageHeader, Screen } from "@/components/ui";
import {
  questionnaireEffectiveReviewStatus,
  questionnaireReviewStatusClassName,
  questionnaireReviewStatusLabel,
} from "@/lib/domain/contractor-questionnaire";

export function ContractorBusinessEditor() {
  const hub = useHub();
  const router = useRouter();
  const formRef = useRef<ContractorBusinessQuestionnaireFormHandle>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [navPhase, setNavPhase] = useState<"idle" | "saving" | "navigating">("idle");
  const navRequestRef = useRef<string | null>(null);
  const cleaner = hub.cleaners.find((item) => item.cleanerId === hub.cleanerId);

  function navigationBlocked(): boolean {
    const form = formRef.current;
    if (navPhase !== "idle") return true;
    if (!form) return false;
    return form.isDirty() || form.isSaving();
  }

  useUnsavedNavigation(Boolean(cleaner), navigationBlocked, (href) => {
    navRequestRef.current = href;
    setPendingHref(href);
    setNavPhase("saving");
  });

  useHubSyncBlocker(() => navigationBlocked() || formSaving);

  useEffect(() => {
    if (navPhase !== "saving" || !pendingHref) return;
    let cancelled = false;
    void formRef.current?.flushSave().then((ok) => {
      if (cancelled) return;
      if (!ok) {
        hub.flash("Could not save. Try again.");
        setNavPhase("idle");
        setPendingHref(null);
        navRequestRef.current = null;
        return;
      }
      hub.flash("Form saved.");
      setNavPhase("navigating");
      router.push(pendingHref);
    });
    return () => {
      cancelled = true;
    };
  }, [navPhase, pendingHref, router, hub]);

  if (!cleaner) {
    return (
      <Screen>
        <PageHeader title="Business information" crumb={{ href: "/cleaner", label: "Home" }} />
        <p className="px-5 pt-4 text-ink/70">Your cleaner profile could not be loaded.</p>
      </Screen>
    );
  }

  const reviewStatus = questionnaireEffectiveReviewStatus(cleaner.businessQuestionnaire);
  const showNavOverlay = navPhase === "saving" || navPhase === "navigating";

  return (
    <Screen>
      <PageHeader title="Business information" crumb={{ href: "/cleaner", label: "Home" }} />
      <div className="space-y-4 px-5 pt-4 pb-8">
        <p className="text-sm text-ink/65">
          Status:{" "}
          <span className={questionnaireReviewStatusClassName(reviewStatus)}>
            {questionnaireReviewStatusLabel(reviewStatus)}
          </span>
        </p>
        <ContractorBusinessQuestionnaireForm
          ref={formRef}
          initialDraft={cleaner.businessQuestionnaireDraft}
          initialQuestionnaire={cleaner.businessQuestionnaire}
          profileMobilePhone={cleaner.mobilePhone}
          profileEmail={cleaner.email}
          savedAt={cleaner.updatedAt}
          onSaveDraft={(input) => hub.saveContractorQuestionnaireDraft(input)}
          onSubmit={(input, attestation) => hub.submitContractorQuestionnaire(input, attestation)}
          onSubmitted={() => hub.flash("Submitted.")}
          onSavingChange={setFormSaving}
        />
      </div>
      {showNavOverlay ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-5 pb-28"
          aria-busy="true"
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgba(51,51,51,0.16)]">
            <h2 className="text-lg font-semibold">{navPhase === "navigating" ? "Saved" : "Saving…"}</h2>
            <p className="mt-4 flex min-h-12 items-center justify-center">
              <ButtonLoadingLabel
                label={navPhase === "navigating" && pendingHref ? "Opening…" : "Saving…"}
              />
            </p>
          </div>
        </div>
      ) : null}
      {navPhase === "navigating" && pendingHref ? (
        <PendingNavigationOverlay
          href={pendingHref}
          onComplete={() => {
            setNavPhase("idle");
            setPendingHref(null);
            navRequestRef.current = null;
          }}
        />
      ) : null}
    </Screen>
  );
}

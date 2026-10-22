"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { recordSmsOnboardingChoice } from "@/app/actions/sms-onboarding";
import { SmsOptInFormCard } from "@/components/cleaner/sms-opt-in-form-card";
import { useHub } from "@/components/hub-provider";

type SmsOnboardingFormProps = {
  initialMobilePhone: string;
};

export function SmsOnboardingForm({ initialMobilePhone }: SmsOnboardingFormProps) {
  const hub = useHub();
  const router = useRouter();

  const prepopulatePhone = useMemo(() => {
    if (initialMobilePhone) return initialMobilePhone;
    if (!hub.cleanerId) return "";
    return hub.cleaners.find((cleaner) => cleaner.cleanerId === hub.cleanerId)?.mobilePhone ?? "";
  }, [hub.cleanerId, hub.cleaners, initialMobilePhone]);

  return (
    <SmsOptInFormCard
      prepopulatePhone={prepopulatePhone}
      onSubmit={async ({ optIn, mobilePhone }) => {
        const result = await recordSmsOnboardingChoice(optIn, mobilePhone);
        if (!result.ok) {
          if (result.message === "Enter a 10-digit mobile number.") {
            return { ok: false, phoneError: result.message };
          }
          return { ok: false, error: result.message };
        }
        hub.applyCleanerSmsConsent({
          smsSchedulingOptIn: result.smsSchedulingOptIn,
          smsOptInRecordedAt: result.smsOptInRecordedAt,
          mobilePhone: result.mobilePhone,
        });
        router.replace("/cleaner");
        return { ok: true };
      }}
    />
  );
}

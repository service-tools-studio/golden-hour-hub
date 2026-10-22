"use client";

import { useRouter } from "next/navigation";
import { SmsOptInFormCard } from "@/components/cleaner/sms-opt-in-form-card";
import {
  PUBLIC_DEMO_CLEANER_HREF,
  PUBLIC_SMS_DEMO_TOAST,
  PUBLIC_SMS_DEMO_TOAST_STORAGE_KEY,
} from "@/lib/demo/public-demo";

export function PublicSmsOptInForm() {
  const router = useRouter();

  return (
    <SmsOptInFormCard
      onSubmit={async () => {
        sessionStorage.setItem(PUBLIC_SMS_DEMO_TOAST_STORAGE_KEY, PUBLIC_SMS_DEMO_TOAST);
        router.push(PUBLIC_DEMO_CLEANER_HREF);
        return { ok: true };
      }}
    />
  );
}

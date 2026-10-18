import { redirect } from "next/navigation";
import { KelseyPhoneProvider } from "@/components/cleaner/kelsey-phone-context";
import { RoleGate } from "@/components/role-gate";
import { kelseyPhoneDigitsFromEnv } from "@/lib/contact";
import { cleanerNeedsSmsOnboarding } from "@/lib/cleaner/sms-consent";
import { cognitoConfigured } from "@/lib/auth/config";
import { dynamoConfigured, loadHub } from "@/lib/data/repository";
import { getServerSession } from "@/lib/auth/session";

export default async function CleanerLayout({ children }: { children: React.ReactNode }) {
  if (cognitoConfigured()) {
    const session = await getServerSession();
    if (session?.role === "CLEANER" && session.cleanerId && dynamoConfigured()) {
      try {
        const hub = await loadHub();
        const cleaner = hub.cleaners.find((item) => item.cleanerId === session.cleanerId);
        if (cleaner && cleanerNeedsSmsOnboarding(cleaner)) {
          redirect("/onboarding/sms");
        }
      } catch {
        /* allow hub to load client-side */
      }
    }
  }

  const kelseyPhoneDigits = kelseyPhoneDigitsFromEnv(process.env.KELSEY_PHONE);

  return (
    <KelseyPhoneProvider phoneDigits={kelseyPhoneDigits}>
      <RoleGate role="CLEANER">{children}</RoleGate>
    </KelseyPhoneProvider>
  );
}

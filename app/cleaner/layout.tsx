import { redirect } from "next/navigation";
import { RoleGate } from "@/components/role-gate";
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

  return <RoleGate role="CLEANER">{children}</RoleGate>;
}

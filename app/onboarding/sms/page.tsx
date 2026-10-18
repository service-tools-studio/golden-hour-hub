import Link from "next/link";
import { redirect } from "next/navigation";
import { SmsOnboardingForm } from "@/components/cleaner/sms-onboarding-form";
import { cleanerAllowsSchedulingSms } from "@/lib/cleaner/sms-consent";
import { cognitoConfigured } from "@/lib/auth/config";
import { dynamoConfigured, loadHub } from "@/lib/data/repository";
import { getServerSession } from "@/lib/auth/session";

export default async function SmsOnboardingPage() {
  if (!cognitoConfigured()) {
    redirect("/login");
  }
  const session = await getServerSession();
  if (!session || session.role !== "CLEANER" || !session.cleanerId) {
    redirect("/login");
  }
  if (dynamoConfigured()) {
    try {
      const hub = await loadHub();
      const cleaner = hub.cleaners.find((item) => item.cleanerId === session.cleanerId);
      if (cleaner && cleanerAllowsSchedulingSms(cleaner)) {
        redirect("/cleaner");
      }
    } catch {
      /* show form; save may fail with message */
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-12">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-ink/50">Golden Hour Cleaning Co.</p>
      <p className="mt-2 text-sm text-ink/60">Step 2 of 2 — SMS notifications</p>
      <SmsOnboardingForm />
      <footer className="mt-auto pt-10 text-center text-sm text-ink/55">
        <Link href="/privacy" className="font-medium text-ink/70 underline decoration-gold decoration-2 underline-offset-4">
          Privacy policy
        </Link>
        <span className="mx-2" aria-hidden="true">·</span>
        <Link href="/terms" className="font-medium text-ink/70 underline decoration-gold decoration-2 underline-offset-4">
          Terms &amp; conditions
        </Link>
      </footer>
    </main>
  );
}

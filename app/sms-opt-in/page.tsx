import type { Metadata } from "next";
import Link from "next/link";
import { PublicSmsOptInForm } from "@/components/cleaner/public-sms-opt-in-form";

export const metadata: Metadata = {
  title: "SMS notifications | Golden Hour Hub",
  description: "Opt in to scheduling text alerts from Golden Hour Cleaning Co.",
};

export default function PublicSmsOptInPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-12">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-ink/50">Golden Hour Cleaning Co.</p>
      <p className="mt-2 text-sm text-ink/60">SMS notifications</p>
      <PublicSmsOptInForm />
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

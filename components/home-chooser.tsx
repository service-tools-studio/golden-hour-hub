"use client";

import { useRouter } from "next/navigation";
import { useHub } from "@/components/hub-provider";
import { personName } from "@/lib/domain/cleaners";

export function HomeChooser() {
  const hub = useHub();
  const router = useRouter();
  const cleaners = hub.cleaners.filter((cleaner) => cleaner.status === "ACTIVE");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-12">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-ink/50">Golden Hour Cleaning Co.</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Golden Hour Hub</h1>
      <p className="mt-3 text-lg leading-7 text-ink/75">Availability, staffing, and crews — simple enough to run from a phone.</p>
      <div className="mt-8 space-y-3">
        <button
          type="button"
          onClick={() => {
            hub.enterAdmin();
            router.push("/admin");
          }}
          className="min-h-16 w-full rounded-3xl bg-ink px-4 text-left text-cream"
        >
          <span className="block text-lg font-semibold">Admin</span>
          <span className="text-sm text-cream/75">Jasmin and Kelsey</span>
        </button>
        {cleaners.map((cleaner) => (
          <button
            key={cleaner.cleanerId}
            type="button"
            onClick={() => {
              hub.enterCleaner(cleaner.cleanerId);
              router.push("/cleaner");
            }}
            className="min-h-16 w-full rounded-3xl bg-white px-4 text-left ring-1 ring-ink/10"
          >
            <span className="block text-lg font-semibold">{personName(cleaner.firstName, cleaner.lastName)}</span>
            <span className="text-sm text-ink/60">
              {cleaner.helpersApproved ? `Helper-approved crew of ${cleaner.typicalCrewSize}` : "Works alone"}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-auto pt-10 text-sm leading-5 text-ink/50">
        Sample schedule for now. Sign-in and the live database are the next step.
      </p>
    </main>
  );
}

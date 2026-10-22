"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { BottomNav, cleanerNav } from "@/components/bottom-nav";
import { useHub } from "@/components/hub-provider";
import { Card, PageHeader, Screen } from "@/components/ui";
import { editableAvailabilityWeeks, formatWeekRange, todayInBusinessZone } from "@/lib/domain/time";
import {
  PUBLIC_DEMO_CLEANER_HREF,
  PUBLIC_SMS_DEMO_TOAST_STORAGE_KEY,
} from "@/lib/demo/public-demo";

const DEMO_NAV = cleanerNav.map((item) => ({
  ...item,
  href: item.href.replace("/cleaner", PUBLIC_DEMO_CLEANER_HREF),
}));

export function DemoCleanerHome() {
  const hub = useHub();
  const today = useMemo(() => todayInBusinessZone(), []);
  const availabilityWeeks = editableAvailabilityWeeks(today);

  useEffect(() => {
    const pending = sessionStorage.getItem(PUBLIC_SMS_DEMO_TOAST_STORAGE_KEY);
    if (!pending) return;
    sessionStorage.removeItem(PUBLIC_SMS_DEMO_TOAST_STORAGE_KEY);
    hub.flash(pending);
  }, [hub]);

  return (
    <>
      <Screen>
        <PageHeader title="What up, Demo!" subtitle="Your jobs and availability" />
        <div className="space-y-4 px-5 pt-5">
          <p className="rounded-2xl border border-ink/10 bg-cream/60 px-4 py-3 text-sm leading-5 text-ink/75">
            This is a sample cleaner dashboard for demonstration. It is not connected to your account or live
            scheduling data.
          </p>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/50">Upcoming jobs</h2>
            <Card>
              <p className="text-base text-ink/70">No confirmed cleanings yet.</p>
            </Card>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/50">Availability</h2>
            {availabilityWeeks.map((week, index) => (
              <Card key={week.weekStart}>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/50">
                  {index === 0 ? "Current week" : "Next week"}
                </p>
                <p className="mt-1 text-xl font-semibold">{formatWeekRange(week.weekStart, week.weekEnd)}</p>
                <p className="mt-2 text-base">⚠ Not submitted yet</p>
                <Link
                  href={`${PUBLIC_DEMO_CLEANER_HREF}/availability?week=${week.weekStart}`}
                  className="mt-4 flex min-h-12 items-center justify-center rounded-2xl bg-ink text-base font-semibold text-cream"
                >
                  Submit availability
                </Link>
              </Card>
            ))}
          </section>
        </div>
      </Screen>
      <BottomNav items={DEMO_NAV} />
    </>
  );
}

"use client";

import { BottomNav, cleanerNav } from "@/components/bottom-nav";
import { Card, PageHeader, Screen } from "@/components/ui";
import { PUBLIC_DEMO_CLEANER_HREF } from "@/lib/demo/public-demo";

const DEMO_NAV = cleanerNav.map((item) => ({
  ...item,
  href: item.href.replace("/cleaner", PUBLIC_DEMO_CLEANER_HREF),
}));

export function DemoCleanerPlaceholderScreen({
  title,
  emptyMessage,
}: {
  title: string;
  emptyMessage: string;
}) {
  return (
    <>
      <Screen>
        <PageHeader title={title} />
        <div className="space-y-4 px-5 pt-5">
          <p className="rounded-2xl border border-ink/10 bg-cream/60 px-4 py-3 text-sm leading-5 text-ink/75">
            Demonstration only — this screen is not connected to live data.
          </p>
          <Card>
            <p className="text-base text-ink/70">{emptyMessage}</p>
          </Card>
        </div>
      </Screen>
      <BottomNav items={DEMO_NAV} />
    </>
  );
}

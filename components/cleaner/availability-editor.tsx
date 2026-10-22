"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useHub } from "@/components/hub-provider";
import { AvailabilityWeekEditor } from "@/components/availability-week-editor";
import { PageHeader, Screen } from "@/components/ui";
import { normalizeAvailabilityWeekStart } from "@/lib/domain/time";

export function AvailabilityEditor() {
  const hub = useHub();
  const router = useRouter();
  const searchParams = useSearchParams();
  const cleanerId = hub.cleanerId;
  const weekStart = normalizeAvailabilityWeekStart(hub.today, searchParams.get("week"));

  if (!cleanerId) return null;

  return (
    <Screen>
      <PageHeader title="Availability" subtitle="Choose a week" />
      <div className="px-5 pt-4">
        <AvailabilityWeekEditor
          cleanerId={cleanerId}
          weekStart={weekStart}
          onWeekStartChange={(next) => router.replace(`/cleaner/availability?week=${next}`)}
          variant="cleaner"
        />
      </div>
    </Screen>
  );
}

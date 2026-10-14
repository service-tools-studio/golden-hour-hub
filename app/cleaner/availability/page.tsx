import { Suspense } from "react";
import { AvailabilityEditor } from "@/components/cleaner/availability-editor";

export default function AvailabilityPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-cream" />}>
      <AvailabilityEditor />
    </Suspense>
  );
}

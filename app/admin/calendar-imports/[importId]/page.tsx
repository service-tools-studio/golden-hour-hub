import { Suspense } from "react";
import { CalendarImportReviewView } from "@/components/admin/calendar-import-review-view";

export default async function CalendarImportReviewPage({
  params,
}: {
  params: Promise<{ importId: string }>;
}) {
  const { importId } = await params;
  return (
    <Suspense fallback={<div className="min-h-dvh bg-cream" />}>
      <CalendarImportReviewView importId={importId} />
    </Suspense>
  );
}
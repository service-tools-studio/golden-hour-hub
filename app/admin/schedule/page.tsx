import { ScheduleView } from "@/components/admin/schedule-view";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[]; view?: string | string[] }>;
}) {
  const { date, view } = await searchParams;
  const initialDate = typeof date === "string" ? date : undefined;
  const initialView = view === "day" ? "day" : "month";
  return <ScheduleView initialDate={initialDate} initialView={initialView} />;
}

import { ScheduleView } from "@/components/admin/schedule-view";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  const { date } = await searchParams;
  const initialDate = typeof date === "string" ? date : undefined;
  return <ScheduleView initialDate={initialDate} />;
}

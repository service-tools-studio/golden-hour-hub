import { AddCleanerView } from "@/components/admin/add-cleaner-view";

export default async function AddCleanerPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { jobId } = await params;
  const query = await searchParams;
  return <AddCleanerView jobId={jobId} fromSchedule={query.from === "schedule"} />;
}

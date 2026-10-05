import { AdminJobDetail } from "@/components/jobs/job-detail";

export default async function AdminJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { jobId } = await params;
  const query = await searchParams;
  return <AdminJobDetail jobId={jobId} fromSchedule={query.from === "schedule"} />;
}

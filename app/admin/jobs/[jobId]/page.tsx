import { AdminJobDetail } from "@/components/jobs/job-detail";
import { cleaningOrigin } from "@/components/jobs/origin";

export default async function AdminJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { jobId } = await params;
  const query = await searchParams;
  return <AdminJobDetail jobId={jobId} from={cleaningOrigin(query.from)} />;
}

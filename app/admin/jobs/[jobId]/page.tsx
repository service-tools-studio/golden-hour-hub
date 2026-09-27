import { AdminJobDetail } from "@/components/jobs/job-detail";

export default async function AdminJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <AdminJobDetail jobId={jobId} />;
}

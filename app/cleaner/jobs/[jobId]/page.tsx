import { CleanerJobDetail } from "@/components/jobs/job-detail";

export default async function CleanerJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <CleanerJobDetail jobId={jobId} />;
}
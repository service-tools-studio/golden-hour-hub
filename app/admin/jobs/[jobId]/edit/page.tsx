import { EditJobView } from "@/components/admin/edit-job-view";

export default async function EditJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ assignment?: string | string[]; cleaner?: string | string[]; customerId?: string | string[] }>;
}) {
  const { jobId } = await params;
  const query = await searchParams;
  const assignmentId = typeof query.assignment === "string" ? query.assignment : "";
  const cleanerId = typeof query.cleaner === "string" ? query.cleaner : "";
  const customerId = typeof query.customerId === "string" ? query.customerId : "";
  return <EditJobView jobId={jobId} assignmentId={assignmentId} cleanerId={cleanerId} customerId={customerId} />;
}

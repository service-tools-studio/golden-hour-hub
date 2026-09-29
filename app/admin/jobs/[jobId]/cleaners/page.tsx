import { AddCleanerView } from "@/components/admin/add-cleaner-view";

export default async function AddCleanerPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <AddCleanerView jobId={jobId} />;
}

import { AddCleanerView } from "@/components/admin/add-cleaner-view";
import { cleaningOrigin } from "@/components/jobs/origin";

export default async function AddCleanerPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { jobId } = await params;
  const query = await searchParams;
  return <AddCleanerView jobId={jobId} from={cleaningOrigin(query.from)} />;
}

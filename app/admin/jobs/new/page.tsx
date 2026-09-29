import { CreateJobView } from "@/components/admin/create-job-view";

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{
    cleanerId?: string | string[];
    date?: string | string[];
    start?: string | string[];
    end?: string | string[];
    customerId?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");
  return (
    <CreateJobView
      cleanerId={one(params.cleanerId)}
      date={one(params.date)}
      start={one(params.start)}
      end={one(params.end)}
      customerId={one(params.customerId)}
    />
  );
}

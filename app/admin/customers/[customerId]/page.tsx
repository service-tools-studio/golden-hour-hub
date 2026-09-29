import { CustomerDetail } from "@/components/admin/customers-view";

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ series?: string | string[]; returnTo?: string | string[] }>;
}) {
  const { customerId } = await params;
  const query = await searchParams;
  const seriesId = typeof query.series === "string" ? query.series : "";
  const returnTo = typeof query.returnTo === "string" ? query.returnTo : "";
  return <CustomerDetail customerId={customerId} initialSeriesId={seriesId} returnTo={returnTo} />;
}

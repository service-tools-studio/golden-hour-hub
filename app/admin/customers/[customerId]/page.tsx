import { Suspense } from "react";
import { CustomerDetail } from "@/components/admin/customers-view";

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ series?: string | string[]; returnTo?: string | string[]; edit?: string | string[] }>;
}) {
  const { customerId } = await params;
  const query = await searchParams;
  const seriesId = typeof query.series === "string" ? query.series : "";
  const returnTo = typeof query.returnTo === "string" ? query.returnTo : "";
  const initialEdit = query.edit === "1";
  return (
    <Suspense fallback={<div className="min-h-dvh bg-cream" />}>
      <CustomerDetail
        key={`${customerId}:${returnTo}:${initialEdit ? "1" : "0"}`}
        customerId={customerId}
        initialSeriesId={seriesId}
        returnTo={returnTo}
        initialEdit={initialEdit}
      />
    </Suspense>
  );
}

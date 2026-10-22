import { Suspense } from "react";
import { NewCustomerView } from "@/components/admin/customers-view";

function param(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[]; firstName?: string | string[]; lastName?: string | string[] }>;
}) {
  const params = await searchParams;
  return (
    <Suspense fallback={<div className="min-h-dvh bg-cream" />}>
      <NewCustomerView
        returnTo={param(params.returnTo)}
        firstName={param(params.firstName)}
        lastName={param(params.lastName)}
      />
    </Suspense>
  );
}

import { NewCustomerView } from "@/components/admin/customers-view";

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const params = await searchParams;
  const returnTo = typeof params.returnTo === "string" ? params.returnTo : undefined;
  return <NewCustomerView returnTo={returnTo} />;
}

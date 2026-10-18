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
    <NewCustomerView
      returnTo={param(params.returnTo)}
      firstName={param(params.firstName)}
      lastName={param(params.lastName)}
    />
  );
}

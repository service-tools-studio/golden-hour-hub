import { CustomerDetail } from "@/components/admin/customers-view";

export default async function CustomerPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  return <CustomerDetail customerId={customerId} />;
}

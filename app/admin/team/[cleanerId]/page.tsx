import { CleanerAdminDetail } from "@/components/admin/team-view";

export default async function CleanerAdminPage({ params }: { params: Promise<{ cleanerId: string }> }) {
  const { cleanerId } = await params;
  return <CleanerAdminDetail cleanerId={cleanerId} />;
}

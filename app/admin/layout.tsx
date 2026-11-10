import { AdminMarketProvider } from "@/components/admin/admin-market";
import { RoleGate } from "@/components/role-gate";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGate role="ADMIN">
      <AdminMarketProvider>{children}</AdminMarketProvider>
    </RoleGate>
  );
}

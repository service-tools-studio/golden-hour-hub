import { RoleGate } from "@/components/role-gate";

export default function CleanerLayout({ children }: { children: React.ReactNode }) {
  return <RoleGate role="CLEANER">{children}</RoleGate>;
}

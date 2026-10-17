import { redirect } from "next/navigation";
import { HomeChooser } from "@/components/home-chooser";
import { cognitoConfigured, previewAuthEnabled } from "@/lib/auth/config";
import { getServerSession } from "@/lib/auth/session";

export default async function Home() {
  if (previewAuthEnabled()) {
    return <HomeChooser />;
  }
  if (cognitoConfigured()) {
    const session = await getServerSession();
    if (session?.role === "ADMIN") redirect("/admin");
    if (session?.role === "CLEANER") redirect("/cleaner");
  }
  redirect("/login");
}

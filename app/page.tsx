import { redirect } from "next/navigation";
import { HomeChooser } from "@/components/home-chooser";
import { cognitoConfigured, previewAuthEnabled } from "@/lib/auth/config";

export default async function Home() {
  if (previewAuthEnabled()) {
    return <HomeChooser />;
  }
  if (cognitoConfigured()) {
    redirect("/api/auth/entry");
  }
  redirect("/login");
}

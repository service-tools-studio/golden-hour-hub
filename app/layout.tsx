import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { HubProvider } from "@/components/hub-provider";
import { JobCleanerBusyDebugProbe } from "@/components/job-cleaner-busy-debug";
import { previewAuthEnabled } from "@/lib/auth/config";
import { previewPersistsToDynamo } from "@/lib/auth/preview-dynamo";
import { resolveHubAuthSession } from "@/lib/auth/guards";
import { loadRemoteHub } from "@/lib/hub/bootstrap-remote";
import { hubSiteMetadata } from "@/lib/site-metadata";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = hubSiteMetadata();

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fffbea",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await resolveHubAuthSession();
  const initialAuth = session ? { role: session.role, cleanerId: session.cleanerId } : null;
  const initialBootstrap = session ? await loadRemoteHub(session) : null;
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full">
        <JobCleanerBusyDebugProbe />
        <HubProvider
          initialAuth={initialAuth}
          initialPreviewAuth={previewAuthEnabled()}
          initialPreviewPersistsToDynamo={previewPersistsToDynamo()}
          initialBootstrap={initialBootstrap}
        >
          {children}
        </HubProvider>
      </body>
    </html>
  );
}

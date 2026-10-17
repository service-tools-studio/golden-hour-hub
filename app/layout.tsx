import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { HubProvider } from "@/components/hub-provider";
import { previewAuthEnabled } from "@/lib/auth/config";
import { getServerSession } from "@/lib/auth/session";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Golden Hour Hub",
  description: "Scheduling and cleaner availability for Golden Hour Cleaning Co.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fffbea",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await getServerSession();
  const initialAuth = session ? { role: session.role, cleanerId: session.cleanerId } : null;
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full">
        <HubProvider initialAuth={initialAuth} initialPreviewAuth={previewAuthEnabled()}>
          {children}
        </HubProvider>
      </body>
    </html>
  );
}

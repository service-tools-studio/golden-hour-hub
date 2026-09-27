import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { HubProvider } from "@/components/hub-provider";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full">
        <HubProvider>{children}</HubProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { DemoCleanerPlaceholderScreen } from "@/components/demo/demo-cleaner-placeholder-screen";

export const metadata: Metadata = {
  title: "Demo schedule | Golden Hour Hub",
  robots: { index: false, follow: false },
};

export default function DemoCleanerSchedulePage() {
  return <DemoCleanerPlaceholderScreen title="My Schedule" emptyMessage="No cleanings on your schedule." />;
}

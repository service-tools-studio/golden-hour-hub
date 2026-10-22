import type { Metadata } from "next";
import { DemoCleanerPlaceholderScreen } from "@/components/demo/demo-cleaner-placeholder-screen";

export const metadata: Metadata = {
  title: "Demo availability | Golden Hour Hub",
  robots: { index: false, follow: false },
};

export default function DemoCleanerAvailabilityPage() {
  return (
    <DemoCleanerPlaceholderScreen
      title="Availability"
      emptyMessage="Availability editing is not available in this demonstration."
    />
  );
}

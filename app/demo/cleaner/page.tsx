import type { Metadata } from "next";
import { DemoCleanerHome } from "@/components/demo/demo-cleaner-home";

export const metadata: Metadata = {
  title: "Demo cleaner dashboard | Golden Hour Hub",
  description: "Demonstration of the Golden Hour Hub cleaner experience.",
  robots: { index: false, follow: false },
};

export default function DemoCleanerPage() {
  return <DemoCleanerHome />;
}

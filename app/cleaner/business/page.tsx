import { Suspense } from "react";
import { ContractorBusinessEditor } from "@/components/cleaner/contractor-business-editor";

export default function CleanerBusinessPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-cream" />}>
      <ContractorBusinessEditor />
    </Suspense>
  );
}

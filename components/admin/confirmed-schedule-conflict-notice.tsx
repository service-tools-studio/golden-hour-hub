import Link from "next/link";
import { Notice } from "@/components/ui";
import type {
  ConfirmedScheduleConflictAction,
  ConfirmedScheduleConflictNotice,
} from "@/lib/domain/scheduling";

function trailingGuidance(action: ConfirmedScheduleConflictAction): string {
  if (action === "invite") return "before sending this invite.";
  if (action === "assign") return "before assigning them here.";
  return "first.";
}

export function ConfirmedScheduleConflictNotice({
  conflict,
  otherCleaningHref,
}: {
  conflict: ConfirmedScheduleConflictNotice;
  otherCleaningHref: string;
}) {
  const { cleanerFirstName, otherCustomerName, action } = conflict;
  return (
    <Notice tone="error">
      This conflicts with another confirmed job for {cleanerFirstName}. Remove {cleanerFirstName} from{" "}
      <Link href={otherCleaningHref} className="font-semibold underline underline-offset-2">
        {otherCustomerName}&apos;s cleaning
      </Link>{" "}
      {trailingGuidance(action)}
    </Notice>
  );
}

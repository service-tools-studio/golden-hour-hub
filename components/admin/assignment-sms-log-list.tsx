"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAssignmentSmsLogs } from "@/app/actions/assignment-sms-logs";
import { assignmentSmsKindLabel, assignmentSmsLogDelivery } from "@/lib/cleaner/assignment-sms-log";
import type { AssignmentSmsLog } from "@/lib/domain/types";

function formatReceivedAt(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function receivedTone(received: string): string {
  if (received === "Yes") return "text-ink";
  if (received === "No") return "text-red-700";
  return "text-ink/55";
}

export function AssignmentSmsLogList({
  assignmentId,
  refreshKey = 0,
}: {
  assignmentId: string;
  refreshKey?: number;
}) {
  const [logs, setLogs] = useState<AssignmentSmsLog[] | null>(null);

  const load = useCallback(async () => {
    const result = await fetchAssignmentSmsLogs(assignmentId);
    setLogs(result.ok ? result.logs : []);
  }, [assignmentId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (logs === null || logs.length === 0) return null;

  return (
    <div className="mt-3 border-t border-ink/10 pt-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/45">Texts sent</p>
        <button type="button" className="text-xs font-medium text-ink/50 underline" onClick={() => void load()}>
          Refresh
        </button>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 gap-y-1 text-xs">
        <span className="text-ink/45">Type</span>
        <span className="text-ink/45">Received</span>
        <span className="text-right text-ink/45">When</span>
        {logs.map((log) => {
          const { received, receivedAt } = assignmentSmsLogDelivery(log);
          return (
            <div key={log.smsLogId} className="contents">
              <span className="font-medium text-ink">{assignmentSmsKindLabel(log.kind)}</span>
              <span className={`font-semibold ${receivedTone(received)}`}>{received}</span>
              <span className="text-right tabular-nums text-ink/70">{formatReceivedAt(receivedAt)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

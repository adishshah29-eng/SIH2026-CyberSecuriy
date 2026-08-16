"use client";

import { useTransition } from "react";
import Link from "next/link";
import { SeverityBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { reviewAnomaly, dismissAnomaly } from "@/app/(dashboard)/anomalies/actions";
import type { AnomalySeverity, AnomalyStatus } from "@/lib/supabase/types";

export interface AnomalyCardData {
  id: string;
  severity: AnomalySeverity;
  status: AnomalyStatus;
  description: string;
  score: number;
  batchCode: string | null;
  stakeholderCode: string | null;
}

export function AnomalyCard({ anomaly }: { anomaly: AnomalyCardData }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SeverityBadge severity={anomaly.severity} />
        <span className="text-xs text-neutral-400">
          {anomaly.status === "open" ? "Open" : anomaly.status === "reviewed" ? "Reviewed" : "Dismissed"}
        </span>
      </div>

      <div className="text-sm">
        {anomaly.batchCode && (
          <Link href={`/batches/${anomaly.batchCode}`} className="font-medium text-emerald-700 hover:underline">
            Batch {anomaly.batchCode}
          </Link>
        )}
        {anomaly.stakeholderCode && (
          <span className="font-medium text-neutral-900">
            {anomaly.batchCode ? " · " : ""}
            {anomaly.stakeholderCode}
          </span>
        )}
      </div>

      <p className="text-sm text-neutral-600">{anomaly.description}</p>

      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
          <div
            className="h-full rounded-full bg-red-500"
            style={{ width: `${anomaly.score}%` }}
          />
        </div>
        <span className="text-xs font-medium text-neutral-500">Anomaly Score: {anomaly.score}%</span>
      </div>

      {anomaly.status === "open" && (
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => startTransition(() => reviewAnomaly(anomaly.id))}
          >
            Mark Reviewed
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => startTransition(() => dismissAnomaly(anomaly.id))}
          >
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}

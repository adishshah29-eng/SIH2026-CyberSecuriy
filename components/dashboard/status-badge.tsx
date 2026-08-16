import { Badge } from "@/components/ui/badge";
import type { BatchStatus, AnomalySeverity, QualityTestStatus } from "@/lib/supabase/types";

const STATUS_MAP: Record<BatchStatus, { label: string; variant: "success" | "warning" | "danger" | "info" }> = {
  Verified: { label: "✅ Verified", variant: "success" },
  Passed: { label: "✅ Passed", variant: "success" },
  Pending: { label: "🟡 Pending", variant: "warning" },
  Failed: { label: "🔴 Failed", variant: "danger" },
};

export function BatchStatusBadge({ status }: { status: BatchStatus }) {
  const config = STATUS_MAP[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

const TEST_STATUS_MAP: Record<QualityTestStatus, { label: string; variant: "success" | "danger" }> = {
  Passed: { label: "✅ Passed", variant: "success" },
  Failed: { label: "🔴 Failed", variant: "danger" },
};

export function TestStatusBadge({ status }: { status: QualityTestStatus }) {
  const config = TEST_STATUS_MAP[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

const SEVERITY_MAP: Record<AnomalySeverity, { label: string; variant: "danger" | "warning" | "info" }> = {
  high: { label: "⚠️ HIGH RISK", variant: "danger" },
  medium: { label: "⚠️ MEDIUM RISK", variant: "warning" },
  low: { label: "LOW", variant: "info" },
};

export function SeverityBadge({ severity }: { severity: AnomalySeverity }) {
  const config = SEVERITY_MAP[severity];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { AnomalyCard, type AnomalyCardData } from "@/components/dashboard/anomaly-card";
import { RealtimeRefresher } from "@/components/dashboard/realtime-refresher";
import type { AnomalySeverity } from "@/lib/supabase/types";

const SEVERITY_ORDER: AnomalySeverity[] = ["high", "medium", "low"];
const SEVERITY_TITLES: Record<AnomalySeverity, string> = {
  high: "High risk",
  medium: "Medium risk",
  low: "Low risk",
};

export default async function AnomaliesPage() {
  const supabase = await createClient();

  const { data: anomalies } = await supabase
    .from("anomalies")
    .select(
      "id, severity, status, description, score, batch:batches(batch_code), stakeholder:stakeholders(code)",
    )
    .order("score", { ascending: false });

  const cards: AnomalyCardData[] = (anomalies ?? []).map((a) => ({
    id: a.id,
    severity: a.severity,
    status: a.status,
    description: a.description,
    score: Number(a.score),
    batchCode: a.batch?.batch_code ?? null,
    stakeholderCode: a.stakeholder?.code ?? null,
  }));

  const openCount = cards.filter((c) => c.status === "open").length;

  return (
    <div className="flex flex-col gap-6">
      <RealtimeRefresher tables={["anomalies"]} />

      <div>
        <h1 className="text-xl font-semibold text-neutral-900">🚨 AI Risk Monitoring</h1>
        <p className="text-sm text-neutral-500">
          {openCount} open alert{openCount === 1 ? "" : "s"} across the network
        </p>
      </div>

      {SEVERITY_ORDER.map((severity) => {
        const items = cards.filter((c) => c.severity === severity);
        if (items.length === 0) return null;

        return (
          <div key={severity} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
              {SEVERITY_TITLES[severity]}
            </h2>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {items.map((a) => (
                <AnomalyCard key={a.id} anomaly={a} />
              ))}
            </div>
          </div>
        );
      })}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">All clear</h2>
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="py-4">
            <p className="text-sm font-medium text-emerald-800">✅ NORMAL — Batch ASH-001</p>
            <p className="text-sm text-emerald-700">
              Full traceability chain verified, no anomalies detected.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

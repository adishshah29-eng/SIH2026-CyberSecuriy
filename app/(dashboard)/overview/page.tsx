import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { LedgerIntegrityBadge } from "@/components/dashboard/ledger-integrity-badge";
import { RealtimeRefresher } from "@/components/dashboard/realtime-refresher";
import { Card, CardContent } from "@/components/ui/card";
import { formatKg } from "@/lib/format";

export default async function OverviewPage() {
  const supabase = await createClient();

  const [batchesRes, openAnomaliesRes, failedTestsRes, verifiedStakeholdersRes] =
    await Promise.all([
      supabase.from("batches").select("quantity_kg, current_stage, status, collection_date"),
      supabase.from("anomalies").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase
        .from("quality_tests")
        .select("id", { count: "exact", head: true })
        .eq("status", "Failed"),
      supabase
        .from("stakeholders")
        .select("id", { count: "exact", head: true })
        .eq("verified", true),
    ]);

  const batches = batchesRes.data ?? [];
  const activeBatches = batches.length;
  const passedQa = batches.filter((b) => b.status === "Verified" || b.status === "Passed").length;
  const inProcessing = batches.filter((b) =>
    ["Processing", "Lab Testing", "Manufacturing"].includes(b.current_stage),
  ).length;
  const riskAlerts = openAnomaliesRes.count ?? 0;

  const totalCollected = batches.reduce((sum, b) => sum + Number(b.quantity_kg), 0);
  const now = new Date();
  const batchesThisMonth = batches.filter((b) => {
    const d = new Date(b.collection_date);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  const failedTests = failedTestsRes.count ?? 0;
  const verifiedSuppliers = verifiedStakeholdersRes.count ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <RealtimeRefresher tables={["batches", "collection_events", "anomalies"]} />

      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Overview</h1>
        <p className="text-sm text-neutral-500">Ashwagandha supply chain — command center</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Active Batches" value={activeBatches} />
        <KpiCard label="Passed QA" value={passedQa} />
        <KpiCard label="In Processing" value={inProcessing} />
        <KpiCard
          label="Risk Alerts"
          value={`${riskAlerts} ⚠️`}
          tone={riskAlerts > 0 ? "warning" : "default"}
        />
      </div>

      <LedgerIntegrityBadge />

      <Card>
        <CardContent className="grid grid-cols-1 gap-6 py-5 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total Ashwagandha collected" value={formatKg(totalCollected)} />
          <Stat label="Batches this month" value={batchesThisMonth} />
          <Stat
            label="Failed quality tests"
            value={failedTests}
            tone={failedTests > 0 ? "danger" : undefined}
          />
          <Stat label="Verified suppliers" value={verifiedSuppliers} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
          <div>
            <p className="text-sm font-medium text-neutral-900">Start the demo walkthrough</p>
            <p className="text-sm text-neutral-500">
              Open batch ASH-001 to see the full collection-to-QR journey.
            </p>
          </div>
          <Link
            href="/batches/ASH-001"
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            View ASH-001 →
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "danger";
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${tone === "danger" ? "text-red-600" : "text-neutral-900"}`}>
        {value}
      </p>
    </div>
  );
}

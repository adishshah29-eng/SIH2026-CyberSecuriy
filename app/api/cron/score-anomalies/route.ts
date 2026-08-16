import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { haversineKm } from "@/lib/geo";

/**
 * Scores real (non-seeded) collection events for anomalies:
 *  - quantity_stat_outlier: z-score vs. this collector's own history
 *  - gps_movement: implausible speed between a collector's consecutive events
 *
 * Deliberately deterministic z-score/haversine rules rather than
 * IsolationForest — no ML runtime needed, fully explainable, and writes into
 * the same `anomalies` table the dashboard already reads, so it's a drop-in
 * replacement for the seed data with zero UI changes.
 *
 * Intended to run on a schedule (Vercel Cron -> this route) rather than as a
 * Supabase Edge Function, since this project already deploys to Vercel and
 * this avoids a second runtime/deploy target. Guarded by CRON_SECRET so it
 * can't be triggered by an arbitrary public request.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: events } = await supabase
    .from("collection_events")
    .select("id, batch_id, collector_id, quantity_kg, latitude, longitude, collected_at")
    .order("collected_at", { ascending: true });

  if (!events || events.length === 0) {
    return NextResponse.json({ created: 0 });
  }

  const { data: existingAnomalies } = await supabase
    .from("anomalies")
    .select("batch_id, anomaly_type");
  const existingKeys = new Set((existingAnomalies ?? []).map((a) => `${a.batch_id}:${a.anomaly_type}`));

  const byCollector = new Map<string, typeof events>();
  for (const e of events) {
    const list = byCollector.get(e.collector_id) ?? [];
    list.push(e);
    byCollector.set(e.collector_id, list);
  }

  const toInsert: {
    batch_id: string;
    stakeholder_id: string;
    anomaly_type: string;
    severity: "low" | "medium" | "high";
    description: string;
    score: number;
  }[] = [];

  for (const [collectorId, collectorEvents] of byCollector) {
    if (collectorEvents.length >= 3) {
      const quantities = collectorEvents.map((e) => Number(e.quantity_kg));
      const mean = quantities.reduce((s, v) => s + v, 0) / quantities.length;
      const variance = quantities.reduce((s, v) => s + (v - mean) ** 2, 0) / quantities.length;
      const stddev = Math.sqrt(variance);

      const latest = collectorEvents[collectorEvents.length - 1];
      const z = stddev > 0 ? (Number(latest.quantity_kg) - mean) / stddev : 0;

      if (Math.abs(z) > 2 && !existingKeys.has(`${latest.batch_id}:quantity_stat_outlier`)) {
        toInsert.push({
          batch_id: latest.batch_id,
          stakeholder_id: collectorId,
          anomaly_type: "quantity_stat_outlier",
          severity: Math.abs(z) > 3 ? "high" : "medium",
          description: `Quantity (${latest.quantity_kg} kg) is a statistical outlier (z=${z.toFixed(2)}) against this collector's own history (mean ${mean.toFixed(0)} kg, n=${quantities.length}).`,
          score: Math.min(95, Math.round(Math.abs(z) * 25)),
        });
      }
    }

    for (let i = 1; i < collectorEvents.length; i++) {
      const prev = collectorEvents[i - 1];
      const curr = collectorEvents[i];
      const km = haversineKm(
        { lat: Number(prev.latitude), lng: Number(prev.longitude) },
        { lat: Number(curr.latitude), lng: Number(curr.longitude) },
      );
      const hours =
        (new Date(curr.collected_at).getTime() - new Date(prev.collected_at).getTime()) / 3_600_000;
      const speedKmh = hours > 0 ? km / hours : 0;

      if (speedKmh > 120 && !existingKeys.has(`${curr.batch_id}:gps_movement`)) {
        toInsert.push({
          batch_id: curr.batch_id,
          stakeholder_id: collectorId,
          anomaly_type: "gps_movement",
          severity: speedKmh > 300 ? "high" : "medium",
          description: `Unexpected GPS movement: ${km.toFixed(0)} km in ${(hours * 60).toFixed(0)} min (implied ${speedKmh.toFixed(0)} km/h) since this collector's previous submission.`,
          score: Math.min(95, Math.round(speedKmh / 4)),
        });
      }
    }
  }

  if (toInsert.length > 0) {
    await supabase.from("anomalies").insert(toInsert);
  }

  return NextResponse.json({ created: toInsert.length });
}

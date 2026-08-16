import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BatchStatusBadge, TestStatusBadge } from "@/components/dashboard/status-badge";
import { BatchTimeline, type TimelineStep } from "@/components/dashboard/batch-timeline";
import { GenerateQrButton } from "@/components/dashboard/generate-qr-button";
import { formatDate, formatDateTime, formatKg, isValidBatchCode } from "@/lib/format";

export default async function BatchDetailPage(props: PageProps<"/batches/[batchCode]">) {
  const { batchCode } = await props.params;

  if (!isValidBatchCode(batchCode)) {
    notFound();
  }

  const supabase = await createClient();

  const { data: batch } = await supabase
    .from("batches")
    .select("*, collector:stakeholders!batches_collector_id_fkey(name, code)")
    .eq("batch_code", batchCode)
    .maybeSingle();

  if (!batch) {
    notFound();
  }

  const [collectionRes, processingRes, qualityRes, productRes] = await Promise.all([
    supabase.from("collection_events").select("*").eq("batch_id", batch.id).maybeSingle(),
    supabase
      .from("processing_events")
      .select("*")
      .eq("batch_id", batch.id)
      .order("start_time", { ascending: true }),
    supabase
      .from("quality_tests")
      .select("*")
      .eq("batch_id", batch.id)
      .order("test_type", { ascending: true }),
    supabase.from("products").select("*").eq("batch_id", batch.id).maybeSingle(),
  ]);

  const collection = collectionRes.data;
  const processing = processingRes.data ?? [];
  const quality = qualityRes.data ?? [];
  const product = productRes.data;

  const processingDone = processing.length > 0 && processing.every((p) => p.end_time);
  const labTested = quality.length > 0;
  const manufactured = ["Manufacturing", "Verified"].includes(batch.current_stage) || !!product;
  const qrGenerated = !!product;

  const steps: TimelineStep[] = [
    { icon: "🌿", label: "Collected", done: !!collection, meta: collection ? formatDate(collection.collected_at) : undefined },
    { icon: "📍", label: "GPS Verified", done: !!collection, meta: collection?.location_name },
    {
      icon: "🏭",
      label: "Processed",
      done: processing.length > 0,
      meta: processingDone
        ? `${processing.length} step(s) complete`
        : processing.length > 0
          ? "In progress"
          : undefined,
    },
    { icon: "🧪", label: "Lab Tested", done: labTested, meta: labTested ? `${quality.length} tests recorded` : undefined },
    { icon: "💊", label: "Manufactured", done: manufactured },
    { icon: "🔲", label: "QR Generated", done: qrGenerated, meta: product?.qr_url },
  ];

  const canGenerateQr = batch.status === "Verified" && !product;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">
            {batch.batch_code} — {batch.herb_name}
          </h1>
          <p className="text-sm text-neutral-500">
            Origin: {batch.origin_location} · Collected {formatDate(batch.collection_date)}
          </p>
        </div>
        <BatchStatusBadge status={batch.status} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Batch details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Detail label="Quantity" value={formatKg(Number(batch.quantity_kg))} />
              <Detail label="Current stage" value={batch.current_stage} />
              <Detail label="Collector" value={batch.collector?.name ?? "—"} />
              <Detail label="Harvest zone" value={collection?.harvest_zone ?? "—"} />
              <Detail
                label="Season valid"
                value={collection ? (collection.season_valid ? "Yes" : "No") : "—"}
              />
              <Detail label="Location" value={collection?.location_name ?? "—"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Traceability timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <BatchTimeline steps={steps} />
            </CardContent>
          </Card>

          {quality.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Quality tests</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="border-b border-neutral-200">
                    <tr>
                      <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase text-neutral-500">Test</th>
                      <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase text-neutral-500">Result</th>
                      <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase text-neutral-500">Threshold</th>
                      <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase text-neutral-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {quality.map((t) => (
                      <tr key={t.id}>
                        <td className="px-5 py-3">{t.test_type}</td>
                        <td className="px-5 py-3">{t.value}</td>
                        <td className="px-5 py-3 text-neutral-500">{t.threshold}</td>
                        <td className="px-5 py-3">
                          <TestStatusBadge status={t.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>QR code</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              {product ? (
                <>
                  <img
                    src={`/api/qr/${batch.batch_code}`}
                    alt={`QR code for ${batch.batch_code}`}
                    className="h-40 w-40 rounded-md border border-neutral-200"
                  />
                  <p className="text-center text-xs text-neutral-500 break-all">{product.qr_url}</p>
                  <p className="text-xs font-medium text-emerald-700">Status: ACTIVE</p>
                </>
              ) : canGenerateQr ? (
                <GenerateQrButton batchCode={batch.batch_code} />
              ) : (
                <p className="text-center text-sm text-neutral-500">
                  QR codes can be generated once a batch reaches <strong>Verified</strong> status.
                </p>
              )}
            </CardContent>
          </Card>

          {processing.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Processing log</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {processing.map((p) => (
                  <div key={p.id} className="text-sm">
                    <p className="font-medium text-neutral-900">{p.process_type}</p>
                    <p className="text-xs text-neutral-500">
                      {formatDateTime(p.start_time)} {p.end_time ? `→ ${formatDateTime(p.end_time)}` : "(in progress)"}
                    </p>
                    {p.notes && <p className="text-xs text-neutral-500">{p.notes}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="text-sm font-medium text-neutral-900">{value}</p>
    </div>
  );
}

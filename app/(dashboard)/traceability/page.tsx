import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { TraceabilityGraph } from "@/components/dashboard/traceability-graph";
import { formatDate } from "@/lib/format";

export default async function TraceabilityPage(props: PageProps<"/traceability">) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();

  const { data: allBatches } = await supabase
    .from("batches")
    .select("batch_code")
    .order("batch_code");

  const codes = (allBatches ?? []).map((b) => b.batch_code);
  const requested = typeof searchParams.batch === "string" ? searchParams.batch : "";
  const selected = codes.includes(requested) ? requested : codes[0];

  let content = null;

  if (selected) {
    const { data: batch } = await supabase
      .from("batches")
      .select("*")
      .eq("batch_code", selected)
      .maybeSingle();

    if (batch) {
      const [collectionRes, processingRes, qualityRes, productRes] = await Promise.all([
        supabase.from("collection_events").select("*").eq("batch_id", batch.id).maybeSingle(),
        supabase.from("processing_events").select("*").eq("batch_id", batch.id).order("start_time"),
        supabase.from("quality_tests").select("*").eq("batch_id", batch.id).order("test_type"),
        supabase.from("products").select("*").eq("batch_id", batch.id).maybeSingle(),
      ]);

      const collection = collectionRes.data;
      const processing = processingRes.data ?? [];
      const quality = qualityRes.data ?? [];
      const product = productRes.data;

      const branches = [
        {
          title: "Collection",
          icon: "🌱",
          lines: collection
            ? [formatDate(collection.collected_at), collection.location_name, `${collection.quantity_kg} kg`]
            : ["Not yet collected"],
        },
        {
          title: "Processing",
          icon: "🏭",
          lines:
            processing.length > 0
              ? processing.map((p) => (p.end_time ? p.process_type : `${p.process_type} (in progress)`))
              : ["Not started"],
        },
        {
          title: "Quality",
          icon: "🧪",
          lines:
            quality.length > 0
              ? quality.map((q) => `${q.test_type} ${q.status === "Passed" ? "✅" : "🔴"}`)
              : ["Awaiting results"],
        },
      ];

      const manufactured = ["Manufacturing", "Verified"].includes(batch.current_stage) || !!product;

      content = (
        <Card>
          <CardContent className="overflow-x-auto py-8">
            <TraceabilityGraph
              batchCode={batch.batch_code}
              branches={branches}
              manufactured={manufactured}
              productName={product?.product_name ?? null}
              qrGenerated={!!product}
            />
          </CardContent>
        </Card>
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Traceability</h1>
          <p className="text-sm text-neutral-500">Full chain of custody for a batch</p>
        </div>

        <form method="get" className="flex items-center gap-2">
          <label htmlFor="batch" className="text-sm text-neutral-600">
            Batch
          </label>
          <select
            id="batch"
            name="batch"
            defaultValue={selected}
            className="h-9 rounded-md border border-neutral-300 bg-white px-2 text-sm"
          >
            {codes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm hover:bg-neutral-50"
          >
            View
          </button>
        </form>
      </div>

      {content}
    </div>
  );
}

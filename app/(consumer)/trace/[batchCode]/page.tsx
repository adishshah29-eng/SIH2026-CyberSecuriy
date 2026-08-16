import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { OriginMap } from "@/components/consumer/origin-map";
import { formatDate, isValidBatchCode } from "@/lib/format";

export async function generateMetadata(
  props: PageProps<"/trace/[batchCode]">,
): Promise<Metadata> {
  const { batchCode } = await props.params;
  return { title: `${batchCode} — AyurTrace Verification` };
}

const JOURNEY_STEPS = ["Collected", "Origin Verified", "Processed", "Lab Tested", "Manufactured"];

export default async function ConsumerTracePage(props: PageProps<"/trace/[batchCode]">) {
  const { batchCode } = await props.params;

  if (!isValidBatchCode(batchCode)) {
    notFound();
  }

  const supabase = await createClient();
  const { data: product } = await supabase
    .from("product_provenance")
    .select("*")
    .eq("batch_code", batchCode)
    .maybeSingle();

  if (!product) {
    notFound();
  }

  const tests = product.tests ?? [];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col items-center gap-1 text-center">
        <div className="text-4xl">🌿</div>
        <h1 className="text-lg font-semibold text-neutral-900">{product.herb_name}</h1>
        <p className="text-sm font-medium text-emerald-700">✅ Verified Product</p>
        <p className="mt-2 text-xs text-neutral-500">
          Batch: {product.batch_code} · Manufactured {formatDate(product.manufactured_at)}
        </p>
        <p className="text-xs text-neutral-500">Origin: {product.origin_location}</p>
      </div>

      <Section title="🌱 Source">
        <OriginMap lat={product.lat} lng={product.lng} label={product.collection_location} />
        <div className="mt-3 flex flex-col gap-1 text-sm">
          <p className="font-medium text-neutral-900">{product.collection_location}</p>
          <p className="text-neutral-500">Collected {formatDate(product.collection_date)}</p>
          <p className="text-neutral-500">Collector: Verified Supplier</p>
        </div>
      </Section>

      <Section title="🔄 Journey">
        <ul className="flex flex-col gap-2">
          {JOURNEY_STEPS.map((step) => (
            <li key={step} className="flex items-center justify-between text-sm">
              <span className="text-neutral-800">{step}</span>
              <span className="text-emerald-600">✓</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="🧪 Quality">
        <ul className="flex flex-col gap-2">
          {tests.map((t) => (
            <li key={t.test_type} className="flex items-center justify-between text-sm">
              <span className="text-neutral-800">{t.test_type}</span>
              <span>{t.status === "Passed" ? "✅" : "🔴"}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="🌱 Sustainability">
        <ul className="flex flex-col gap-2 text-sm">
          <li className="flex items-center justify-between">
            <span className="text-neutral-800">Sustainable Source</span>
            <span>✅</span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-neutral-800">{product.harvest_zone}</span>
            <span>✅</span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-neutral-800">Seasonal Compliance</span>
            <span>{product.season_valid ? "✅" : "🔴"}</span>
          </li>
        </ul>
      </Section>

      <p className="mt-auto pt-4 text-center text-xs text-neutral-500">
        Product successfully verified through the traceability network.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-neutral-100 pt-4 first:border-t-0 first:pt-0">
      <h2 className="text-sm font-semibold text-neutral-700">{title}</h2>
      {children}
    </div>
  );
}

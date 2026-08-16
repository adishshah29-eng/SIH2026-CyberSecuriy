import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildQrUrl, generateQrToken } from "@/lib/qr";
import { isValidBatchCode } from "@/lib/format";

export async function POST(_request: Request, context: RouteContext<"/api/batches/[batchCode]/generate-qr">) {
  const { batchCode } = await context.params;

  if (!isValidBatchCode(batchCode)) {
    return NextResponse.json({ error: "Invalid batch code." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data: batch } = await supabase
    .from("batches")
    .select("id, batch_code, herb_name, status")
    .eq("batch_code", batchCode)
    .maybeSingle();

  if (!batch) {
    return NextResponse.json({ error: "Batch not found." }, { status: 404 });
  }

  if (batch.status !== "Verified") {
    return NextResponse.json(
      { error: "Batch must reach Verified status before a QR code can be generated." },
      { status: 400 },
    );
  }

  const { data: existing } = await supabase
    .from("products")
    .select("id")
    .eq("batch_id", batch.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "QR code already generated for this batch." }, { status: 409 });
  }

  // Insert happens with the service-role client: the caller's session was
  // already verified above, and the products table has no authenticated
  // insert policy by design — writes here are gated by this route, not RLS.
  const service = createServiceClient();
  const { data: product, error } = await service
    .from("products")
    .insert({
      batch_id: batch.id,
      product_name: `${batch.herb_name} Root Powder 250g`,
      manufactured_at: new Date().toISOString(),
      qr_token: generateQrToken(),
      qr_url: buildQrUrl(batch.batch_code),
      status: "active",
    })
    .select()
    .single();

  if (error || !product) {
    return NextResponse.json({ error: "Failed to generate QR code." }, { status: 500 });
  }

  revalidatePath(`/batches/${batchCode}`);
  revalidatePath("/traceability");
  revalidatePath("/overview");

  return NextResponse.json({ product }, { status: 201 });
}

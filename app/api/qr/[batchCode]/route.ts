import QRCode from "qrcode";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isValidBatchCode } from "@/lib/format";

export async function GET(_request: Request, context: RouteContext<"/api/qr/[batchCode]">) {
  const { batchCode } = await context.params;

  if (!isValidBatchCode(batchCode)) {
    return new NextResponse("Invalid batch code", { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: batch } = await supabase
    .from("batches")
    .select("id")
    .eq("batch_code", batchCode)
    .maybeSingle();

  if (!batch) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { data: product } = await supabase
    .from("products")
    .select("qr_url")
    .eq("batch_id", batch.id)
    .eq("status", "active")
    .maybeSingle();

  if (!product) {
    return new NextResponse("QR code not generated for this batch", { status: 404 });
  }

  const png = await QRCode.toBuffer(product.qr_url, { type: "png", width: 320, margin: 1 });

  return new NextResponse(new Blob([new Uint8Array(png)], { type: "image/png" }), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

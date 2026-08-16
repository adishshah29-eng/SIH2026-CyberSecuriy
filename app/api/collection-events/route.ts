import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isWithinIndia } from "@/lib/geo";

interface SubmissionBody {
  quantity_kg: unknown;
  harvest_zone: unknown;
  location_name: unknown;
  latitude: unknown;
  longitude: unknown;
}

function parseBody(body: SubmissionBody) {
  const errors: string[] = [];

  const quantityKg = Number(body.quantity_kg);
  if (!Number.isFinite(quantityKg) || quantityKg <= 0 || quantityKg > 1000) {
    errors.push("quantity_kg must be a number between 0 and 1000.");
  }

  const harvestZone = typeof body.harvest_zone === "string" ? body.harvest_zone.trim() : "";
  if (!harvestZone) errors.push("harvest_zone is required.");

  const locationName = typeof body.location_name === "string" ? body.location_name.trim() : "";
  if (!locationName) errors.push("location_name is required.");

  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    errors.push("latitude/longitude must be numbers — capture GPS location before submitting.");
  } else if (!isWithinIndia(latitude, longitude)) {
    errors.push("GPS location is outside the expected collection region.");
  }

  return { errors, quantityKg, harvestZone, locationName, latitude, longitude };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data: collector } = await supabase
    .from("stakeholders")
    .select("id, code, name")
    .eq("auth_user_id", user.id)
    .eq("role", "collector")
    .maybeSingle();

  if (!collector) {
    return NextResponse.json(
      { error: "This account is not linked to a collector profile." },
      { status: 403 },
    );
  }

  let body: SubmissionBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { errors, quantityKg, harvestZone, locationName, latitude, longitude } = parseBody(body);
  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(" ") }, { status: 400 });
  }

  // Server-side plausibility check against this collector's own history —
  // never trust the client-reported quantity in isolation. Full statistical
  // scoring against the whole network happens later in the anomaly scoring
  // job; this is a cheap first-line sanity check at submission time.
  const { data: pastEvents } = await supabase
    .from("collection_events")
    .select("quantity_kg")
    .eq("collector_id", collector.id);

  let plausibilityNote: string | null = null;
  if (pastEvents && pastEvents.length >= 3) {
    const avg = pastEvents.reduce((sum, e) => sum + Number(e.quantity_kg), 0) / pastEvents.length;
    if (quantityKg > avg * 2.5) {
      plausibilityNote = `Quantity (${quantityKg} kg) is more than 2.5x this collector's historical average (${avg.toFixed(0)} kg).`;
    }
  }

  const service = createServiceClient();

  const { count } = await service
    .from("batches")
    .select("id", { count: "exact", head: true });
  const batchCode = `ASH-${String((count ?? 0) + 1).padStart(3, "0")}`;

  const { data: batch, error: batchError } = await service
    .from("batches")
    .insert({
      batch_code: batchCode,
      quantity_kg: quantityKg,
      collection_date: new Date().toISOString().slice(0, 10),
      current_stage: "Collected",
      status: "Pending",
      collector_id: collector.id,
      origin_location: locationName,
    })
    .select("id, batch_code")
    .single();

  if (batchError || !batch) {
    return NextResponse.json({ error: "Failed to create batch." }, { status: 500 });
  }

  const { error: eventError } = await service.from("collection_events").insert({
    batch_id: batch.id,
    collector_id: collector.id,
    latitude,
    longitude,
    location_name: locationName,
    quantity_kg: quantityKg,
    collected_at: new Date().toISOString(),
    harvest_zone: harvestZone,
    season_valid: true,
  });

  if (eventError) {
    return NextResponse.json({ error: "Failed to record collection event." }, { status: 500 });
  }

  if (plausibilityNote) {
    await service.from("anomalies").insert({
      batch_id: batch.id,
      stakeholder_id: collector.id,
      anomaly_type: "quantity_spike",
      severity: "medium",
      description: plausibilityNote,
      score: 60,
    });
  }

  revalidatePath("/overview");
  revalidatePath("/batches");
  revalidatePath("/anomalies");

  return NextResponse.json({ batch_code: batch.batch_code }, { status: 201 });
}

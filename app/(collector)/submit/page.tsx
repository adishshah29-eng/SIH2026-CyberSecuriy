"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

type GpsState =
  | { status: "idle" }
  | { status: "capturing" }
  | { status: "captured"; lat: number; lng: number }
  | { status: "error"; message: string };

export default function SubmitCollectionPage() {
  const [gps, setGps] = useState<GpsState>({ status: "idle" });
  const [quantityKg, setQuantityKg] = useState("");
  const [harvestZone, setHarvestZone] = useState("");
  const [locationName, setLocationName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function captureGps() {
    if (!("geolocation" in navigator)) {
      setGps({ status: "error", message: "Geolocation is not supported on this device." });
      return;
    }
    setGps({ status: "capturing" });
    navigator.geolocation.getCurrentPosition(
      (pos) => setGps({ status: "captured", lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => setGps({ status: "error", message: err.message }),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (gps.status !== "captured") return;

    setSubmitting(true);
    setResult(null);

    const res = await fetch("/api/collection-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quantity_kg: Number(quantityKg),
        harvest_zone: harvestZone,
        location_name: locationName,
        latitude: gps.lat,
        longitude: gps.lng,
      }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setResult({ ok: false, message: data.error ?? "Submission failed." });
      return;
    }

    setResult({ ok: true, message: `Submitted as batch ${data.batch_code}.` });
    setQuantityKg("");
    setHarvestZone("");
    setLocationName("");
    setGps({ status: "idle" });
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">New Collection</h1>
        <p className="text-sm text-neutral-500">Submit a fresh harvest from the field.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-3 py-4">
            <p className="text-sm font-medium text-neutral-700">GPS Location</p>
            <Button type="button" variant="outline" onClick={captureGps} disabled={gps.status === "capturing"}>
              {gps.status === "capturing" ? "Capturing…" : "📍 Capture GPS Location"}
            </Button>
            {gps.status === "captured" && (
              <p className="text-xs text-neutral-500">
                {gps.lat.toFixed(4)}, {gps.lng.toFixed(4)}
              </p>
            )}
            {gps.status === "error" && <p className="text-xs text-red-600">{gps.message}</p>}
            <p className="text-xs text-neutral-400">
              Location is read directly from your device — it can&apos;t be typed in manually.
            </p>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-neutral-700">Location name</label>
          <Input
            required
            placeholder="e.g. Trimbakeshwar, Nashik"
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-neutral-700">Quantity (kg)</label>
          <Input
            required
            type="number"
            min="0.1"
            max="1000"
            step="0.1"
            value={quantityKg}
            onChange={(e) => setQuantityKg(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-neutral-700">Harvest zone</label>
          <Input
            required
            placeholder="e.g. Approved Zone A"
            value={harvestZone}
            onChange={(e) => setHarvestZone(e.target.value)}
          />
        </div>

        {result && (
          <p className={`text-sm ${result.ok ? "text-emerald-700" : "text-red-600"}`}>
            {result.message}
          </p>
        )}

        <Button type="submit" disabled={gps.status !== "captured" || submitting} className="mt-2">
          {submitting ? "Submitting…" : "Submit Collection"}
        </Button>
      </form>
    </div>
  );
}

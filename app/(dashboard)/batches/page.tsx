import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { BatchStatusBadge } from "@/components/dashboard/status-badge";
import { RealtimeRefresher } from "@/components/dashboard/realtime-refresher";
import { formatDate, formatKg } from "@/lib/format";
import type { BatchStage } from "@/lib/supabase/types";

const STAGES: BatchStage[] = [
  "Collected",
  "Processing",
  "Lab Testing",
  "Manufacturing",
  "Verified",
  "Failed",
];

export default async function BatchesPage(props: PageProps<"/batches">) {
  const searchParams = await props.searchParams;
  const rawStage = typeof searchParams.stage === "string" ? searchParams.stage : "";
  const stageFilter = (STAGES as readonly string[]).includes(rawStage)
    ? (rawStage as BatchStage)
    : "";

  const supabase = await createClient();
  let query = supabase
    .from("batches")
    .select("batch_code, collection_date, origin_location, quantity_kg, current_stage, status")
    .order("collection_date", { ascending: false });

  if (stageFilter) {
    query = query.eq("current_stage", stageFilter);
  }

  const { data: batches } = await query;

  return (
    <div className="flex flex-col gap-6">
      <RealtimeRefresher tables={["batches"]} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Batch Management</h1>
          <p className="text-sm text-neutral-500">All Ashwagandha batches in the network</p>
        </div>

        <form method="get" className="flex items-center gap-2">
          <label htmlFor="stage" className="text-sm text-neutral-600">
            Stage
          </label>
          <select
            id="stage"
            name="stage"
            defaultValue={stageFilter}
            className="h-9 rounded-md border border-neutral-300 bg-white px-2 text-sm"
          >
            <option value="">All stages</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm hover:bg-neutral-50"
          >
            Filter
          </button>
        </form>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch ID</TableHead>
                <TableHead>Collection Date</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(batches ?? []).map((batch) => (
                <TableRow key={batch.batch_code}>
                  <TableCell>
                    <Link
                      href={`/batches/${batch.batch_code}`}
                      className="font-medium text-emerald-700 hover:underline"
                    >
                      {batch.batch_code}
                    </Link>
                  </TableCell>
                  <TableCell>{formatDate(batch.collection_date)}</TableCell>
                  <TableCell>{batch.origin_location.split(",")[0]}</TableCell>
                  <TableCell>{formatKg(Number(batch.quantity_kg))}</TableCell>
                  <TableCell>{batch.current_stage}</TableCell>
                  <TableCell>
                    <BatchStatusBadge status={batch.status} />
                  </TableCell>
                </TableRow>
              ))}
              {(!batches || batches.length === 0) && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-neutral-500">
                    No batches match this filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

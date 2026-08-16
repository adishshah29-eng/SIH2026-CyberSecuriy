import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { TestStatusBadge } from "@/components/dashboard/status-badge";
import { formatDateTime } from "@/lib/format";

export default async function QualityPage(props: PageProps<"/quality">) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();

  const { data: testedBatches } = await supabase
    .from("quality_tests")
    .select("batch_id, batches!inner(batch_code)")
    .order("batch_id");

  const uniqueBatchCodes = Array.from(
    new Map((testedBatches ?? []).map((t) => [t.batch_id, t.batches.batch_code])).values(),
  ).sort();

  const requestedBatch = typeof searchParams.batch === "string" ? searchParams.batch : "";
  const selectedBatchCode = uniqueBatchCodes.includes(requestedBatch)
    ? requestedBatch
    : uniqueBatchCodes[0];

  let tests: {
    id: string;
    test_type: string;
    value: string;
    threshold: string;
    status: "Passed" | "Failed";
    tested_at: string;
  }[] = [];
  let labName: string | null = null;

  if (selectedBatchCode) {
    const { data: batch } = await supabase
      .from("batches")
      .select("id")
      .eq("batch_code", selectedBatchCode)
      .maybeSingle();

    if (batch) {
      const { data } = await supabase
        .from("quality_tests")
        .select(
          "id, test_type, value, threshold, status, tested_at, lab:stakeholders!quality_tests_lab_id_fkey(name)",
        )
        .eq("batch_id", batch.id)
        .order("test_type");

      tests = data ?? [];
      labName = data?.[0]?.lab?.name ?? null;
    }
  }

  const allPassed = tests.length > 0 && tests.every((t) => t.status === "Passed");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Quality & Compliance</h1>
          <p className="text-sm text-neutral-500">Lab test results per batch</p>
        </div>

        <form method="get" className="flex items-center gap-2">
          <label htmlFor="batch" className="text-sm text-neutral-600">
            Batch
          </label>
          <select
            id="batch"
            name="batch"
            defaultValue={selectedBatchCode}
            className="h-9 rounded-md border border-neutral-300 bg-white px-2 text-sm"
          >
            {uniqueBatchCodes.map((code) => (
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

      {selectedBatchCode ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                {selectedBatchCode} — Ashwagandha {labName ? `· Tested by ${labName}` : ""}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Test</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Threshold</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tested</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tests.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.test_type}</TableCell>
                      <TableCell>{t.value}</TableCell>
                      <TableCell className="text-neutral-500">{t.threshold}</TableCell>
                      <TableCell>
                        <TestStatusBadge status={t.status} />
                      </TableCell>
                      <TableCell className="text-neutral-500">{formatDateTime(t.tested_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className={allPassed ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"}>
            <CardContent className="flex items-center justify-center py-6">
              <p className={`text-lg font-semibold ${allPassed ? "text-emerald-800" : "text-red-800"}`}>
                Overall Quality Status: {allPassed ? "✅ PASSED" : "🔴 FAILED"}
              </p>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-neutral-500">
            No batches have recorded quality tests yet.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

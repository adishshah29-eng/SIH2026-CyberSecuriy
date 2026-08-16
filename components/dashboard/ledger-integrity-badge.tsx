import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";

export async function LedgerIntegrityBadge() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("verify_ledger_chain");

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-5">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="text-sm font-medium text-neutral-900">Chain Integrity: Unknown</p>
            <p className="text-sm text-neutral-500">Could not run verification.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const entries = data ?? [];
  const broken = entries.filter((e) => !e.chain_ok || !e.payload_ok);
  const isClean = broken.length === 0 && entries.length > 0;

  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-5">
        <span className="text-2xl">{isClean ? "✅" : "🔴"}</span>
        <div>
          <p className="text-sm font-medium text-neutral-900">
            {isClean
              ? "Chain Integrity: Verified"
              : `Chain Integrity: Tamper detected at ${broken.length} entr${broken.length === 1 ? "y" : "ies"}`}
          </p>
          <p className="text-sm text-neutral-500">
            {isClean
              ? `All ${entries.length} ledger entries hash-verified against source records.`
              : `First break: entry #${broken[0].entry_id} (${broken[0].entity_table}).`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

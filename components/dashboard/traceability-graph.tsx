interface BranchItem {
  title: string;
  icon: string;
  lines: string[];
}

export function TraceabilityGraph({
  batchCode,
  branches,
  manufactured,
  productName,
  qrGenerated,
}: {
  batchCode: string;
  branches: BranchItem[];
  manufactured: boolean;
  productName: string | null;
  qrGenerated: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-0">
      <Node label={batchCode} icon="🌿" active />
      <Connector active />

      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
        {branches.map((branch) => (
          <div key={branch.title} className="flex flex-col items-center gap-0">
            <div className="h-4 w-0.5 bg-emerald-300" />
            <div className="w-full rounded-lg border-2 border-emerald-200 bg-emerald-50 p-4 text-center">
              <p className="text-sm font-semibold text-emerald-900">
                {branch.icon} {branch.title}
              </p>
              <div className="mt-2 flex flex-col gap-0.5">
                {branch.lines.map((line) => (
                  <p key={line} className="text-xs text-emerald-700">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Connector active />
      <Node label="Manufacturing" icon="💊" active={manufactured} />
      <Connector active={manufactured} />
      <Node label={productName ?? "Final Product"} icon="📦" active={manufactured} />
      <Connector active={qrGenerated} />
      <Node label={qrGenerated ? "QR Code Active" : "QR Not Yet Generated"} icon="🔲" active={qrGenerated} />
    </div>
  );
}

function Node({ label, icon, active }: { label: string; icon: string; active: boolean }) {
  return (
    <div
      className={`rounded-full border-2 px-5 py-2 text-sm font-semibold ${
        active
          ? "border-emerald-600 bg-emerald-600 text-white"
          : "border-neutral-300 bg-neutral-100 text-neutral-400"
      }`}
    >
      {icon} {label}
    </div>
  );
}

function Connector({ active }: { active: boolean }) {
  return <div className={`h-6 w-0.5 ${active ? "bg-emerald-300" : "bg-neutral-200"}`} />;
}

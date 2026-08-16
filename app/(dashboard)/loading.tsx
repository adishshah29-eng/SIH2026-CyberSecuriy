export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-6 w-48 animate-pulse rounded bg-neutral-200" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-neutral-200 bg-neutral-100" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-neutral-200 bg-neutral-100" />
    </div>
  );
}

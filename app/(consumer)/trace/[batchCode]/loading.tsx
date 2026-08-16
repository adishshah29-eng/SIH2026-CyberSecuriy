export default function TraceLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col items-center gap-2">
        <div className="h-10 w-10 animate-pulse rounded-full bg-neutral-200" />
        <div className="h-4 w-32 animate-pulse rounded bg-neutral-200" />
        <div className="h-3 w-24 animate-pulse rounded bg-neutral-100" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-lg bg-neutral-100" />
      ))}
    </div>
  );
}

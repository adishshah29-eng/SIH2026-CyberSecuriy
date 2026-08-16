export default function TraceNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="text-4xl">❓</div>
      <h1 className="text-lg font-semibold text-neutral-900">This product could not be verified</h1>
      <p className="text-sm text-neutral-500">
        We couldn&apos;t find a verified batch matching this QR code. If you scanned this from a
        physical product, please contact the manufacturer.
      </p>
    </div>
  );
}

export default function ConsumerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-white shadow-sm">
        {children}
      </div>
    </div>
  );
}

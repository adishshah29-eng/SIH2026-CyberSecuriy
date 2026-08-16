import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/dashboard/logout-button";

export default async function CollectorLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: collector } = await supabase
    .from("stakeholders")
    .select("id, name, code")
    .eq("auth_user_id", user.id)
    .eq("role", "collector")
    .maybeSingle();

  if (!collector) {
    redirect("/overview");
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-neutral-900">🌿 AyurTrace Collector</p>
            <p className="text-xs text-neutral-500">
              {collector.name} · {collector.code}
            </p>
          </div>
          <LogoutButton />
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}

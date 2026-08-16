import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: collector } = await supabase
    .from("stakeholders")
    .select("id")
    .eq("auth_user_id", user.id)
    .eq("role", "collector")
    .maybeSingle();

  redirect(collector ? "/submit" : "/overview");
}

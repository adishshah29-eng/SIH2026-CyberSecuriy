"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AnomalyStatus } from "@/lib/supabase/types";

async function setAnomalyStatus(id: string, status: AnomalyStatus) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await supabase.from("anomalies").update({ status }).eq("id", id);

  revalidatePath("/anomalies");
  revalidatePath("/overview");
}

export async function reviewAnomaly(id: string) {
  await setAnomalyStatus(id, "reviewed");
}

export async function dismissAnomaly(id: string) {
  await setAnomalyStatus(id, "dismissed");
}

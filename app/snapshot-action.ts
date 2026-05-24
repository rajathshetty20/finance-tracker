"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";

export async function saveNetworthSnapshot(formData: FormData) {
  const nw            = Number(formData.get("nw"));
  const invest_market = Number(formData.get("invest_market"));
  const cash          = Number(formData.get("cash"));
  const debt_pending  = Number(formData.get("debt_pending"));
  if (![nw, invest_market, cash, debt_pending].every(Number.isFinite)) {
    return { error: "Invalid snapshot values." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("networth_snapshots").upsert(
    {
      user_id: user.id,
      date: todayISO(),
      nw,
      invest_market,
      cash,
      debt_pending,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,date" },
  );
  if (error) return { error: error.message };

  revalidatePath("/");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { DEMO_WRITE_ERROR, isDemoWriteBlocked } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

export async function createCash(formData: FormData) {
  if (await isDemoWriteBlocked()) return { error: DEMO_WRITE_ERROR };
  const name = String(formData.get("name") ?? "").trim();
  const amount = Number(formData.get("amount"));
  if (!name || !Number.isFinite(amount)) {
    return { error: "Name and amount are required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("cash_balances").insert({
    user_id: user.id,
    name,
    amount,
  });
  if (error) return { error: error.message };

  revalidatePath("/cash");
  return { ok: true };
}

export async function updateCash(formData: FormData) {
  if (await isDemoWriteBlocked()) return { error: DEMO_WRITE_ERROR };
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const amount = Number(formData.get("amount"));
  if (!id || !name || !Number.isFinite(amount)) {
    return { error: "Name and amount are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("cash_balances")
    .update({ name, amount, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/cash");
  return { ok: true };
}

export async function deleteCash(formData: FormData) {
  if (await isDemoWriteBlocked()) return { error: DEMO_WRITE_ERROR };
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing id." };

  const supabase = await createClient();
  const { error } = await supabase.from("cash_balances").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/cash");
  return { ok: true };
}

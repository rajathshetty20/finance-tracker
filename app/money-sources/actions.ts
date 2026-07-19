"use server";

import { revalidatePath } from "next/cache";
import { DEMO_WRITE_ERROR, isDemoWriteBlocked } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

export async function createManualMoneySource(formData: FormData) {
  if (await isDemoWriteBlocked()) return { error: DEMO_WRITE_ERROR };
  const name = String(formData.get("name") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const date = String(formData.get("date") ?? "").trim();
  if (!name || !date || !Number.isFinite(amount)) {
    return { error: "Name, date, and amount are required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("money_sources").insert({
    user_id: user.id,
    name,
    amount,
    date,
    kind: "manual",
  });
  if (error) return { error: error.message };

  revalidatePath("/money-sources");
  return { ok: true };
}

export async function updateManualMoneySource(formData: FormData) {
  if (await isDemoWriteBlocked()) return { error: DEMO_WRITE_ERROR };
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const date = String(formData.get("date") ?? "").trim();
  if (!id || !name || !date || !Number.isFinite(amount)) {
    return { error: "Name, date, and amount are required." };
  }

  const supabase = await createClient();

  // Guard: only edit manual entries
  const { data: row } = await supabase
    .from("money_sources")
    .select("kind")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { error: "Not found." };
  if (row.kind !== "manual") {
    return { error: "Only manual entries can be edited." };
  }

  const { error } = await supabase
    .from("money_sources")
    .update({ name, amount, date })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/money-sources");
  return { ok: true };
}

export async function deleteManualMoneySource(formData: FormData) {
  if (await isDemoWriteBlocked()) return { error: DEMO_WRITE_ERROR };
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing id." };

  const supabase = await createClient();

  const { data: row } = await supabase
    .from("money_sources")
    .select("kind")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { error: "Not found." };
  if (row.kind !== "manual") {
    return { error: "Only manual entries can be deleted." };
  }

  const { error } = await supabase.from("money_sources").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/money-sources");
  return { ok: true };
}

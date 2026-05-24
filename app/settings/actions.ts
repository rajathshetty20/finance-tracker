"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CategoryKinds, type CategoryKind } from "@/lib/types";

export async function createCategory(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "") as CategoryKind;
  if (!name) return { error: "Name is required." };
  if (!CategoryKinds.includes(kind)) return { error: "Invalid kind." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("categories").insert({
    user_id: user.id,
    name,
    kind,
  });
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}

export async function renameCategory(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return { error: "Name is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("categories").update({ name }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteCategory(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing id." };

  const supabase = await createClient();
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) {
    // FK ON DELETE RESTRICT surfaces a Postgres error if in use.
    return { error: "Cannot delete: this category is in use by expenses or incomes." };
  }

  revalidatePath("/settings");
  return { ok: true };
}

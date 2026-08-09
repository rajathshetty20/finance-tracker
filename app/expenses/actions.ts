"use server";

import { revalidatePath } from "next/cache";
import { DEMO_WRITE_ERROR, isDemoWriteBlocked } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

const TABLE = "expenses";
// The ledger now lives on /cashflow; the old route still resolves (it
// redirects), so both are revalidated after a write.
const ROUTES = ["/expenses", "/cashflow", "/"];

export async function createExpense(formData: FormData) {
  if (await isDemoWriteBlocked()) return { error: DEMO_WRITE_ERROR };
  const date = String(formData.get("date") ?? "").trim();
  const category_id = String(formData.get("category_id") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!date || !category_id || !Number.isFinite(amount) || amount <= 0) {
    return { error: "Date, category, and a positive amount are required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: current } = await supabase
    .from("phases")
    .select("id, start_date")
    .is("end_date", null)
    .maybeSingle();
  if (!current) return { error: "No current phase. Create one first." };
  if (date < current.start_date) {
    return { error: "Date cannot be before the current phase's start." };
  }

  const { error } = await supabase.from(TABLE).insert({
    user_id: user.id,
    phase_id: current.id,
    category_id,
    date,
    amount,
    note,
  });
  if (error) return { error: error.message };

  for (const r of ROUTES) revalidatePath(r);
  return { ok: true };
}

export async function updateExpense(formData: FormData) {
  if (await isDemoWriteBlocked()) return { error: DEMO_WRITE_ERROR };
  const id = String(formData.get("id") ?? "");
  const date = String(formData.get("date") ?? "").trim();
  const category_id = String(formData.get("category_id") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!id || !date || !category_id || !Number.isFinite(amount) || amount <= 0) {
    return { error: "Date, category, and a positive amount are required." };
  }

  const supabase = await createClient();

  // Verify the entry is in the current (open) phase.
  const { data: row } = await supabase
    .from(TABLE)
    .select("phase:phases(end_date, start_date)")
    .eq("id", id)
    .maybeSingle();
  const phase = (row as { phase: { end_date: string | null; start_date: string } | null } | null)?.phase;
  if (!phase) return { error: "Entry not found." };
  if (phase.end_date !== null) return { error: "Entries in closed phases are immutable." };
  if (date < phase.start_date) {
    return { error: "Date cannot be before the current phase's start." };
  }

  const { error } = await supabase
    .from(TABLE)
    .update({ date, category_id, amount, note })
    .eq("id", id);
  if (error) return { error: error.message };

  for (const r of ROUTES) revalidatePath(r);
  return { ok: true };
}

export async function deleteExpense(formData: FormData) {
  if (await isDemoWriteBlocked()) return { error: DEMO_WRITE_ERROR };
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing id." };

  const supabase = await createClient();
  const { data: row } = await supabase
    .from(TABLE)
    .select("phase:phases(end_date)")
    .eq("id", id)
    .maybeSingle();
  const phase = (row as { phase: { end_date: string | null } | null } | null)?.phase;
  if (!phase) return { error: "Entry not found." };
  if (phase.end_date !== null) return { error: "Entries in closed phases are immutable." };

  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) return { error: error.message };

  for (const r of ROUTES) revalidatePath(r);
  return { ok: true };
}

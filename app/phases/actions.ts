"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function addDaysISO(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export async function createFirstPhase(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const start_date = String(formData.get("start_date") ?? "").trim();
  if (!name || !start_date) return { error: "Name and start date are required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // Guard: only allow if no phases exist
  const { count } = await supabase
    .from("phases")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) return { error: "A phase already exists." };

  const { error } = await supabase.from("phases").insert({
    user_id: user.id,
    name,
    start_date,
    end_date: null,
  });
  if (error) return { error: error.message };

  revalidatePath("/phases");
  revalidatePath("/");
  return { ok: true };
}

export async function endAndStartNewPhase(formData: FormData) {
  const new_name = String(formData.get("new_name") ?? "").trim();
  const end_date = String(formData.get("end_date") ?? todayISO()).trim();
  if (!new_name) return { error: "New phase name is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: current, error: currentErr } = await supabase
    .from("phases")
    .select("*")
    .is("end_date", null)
    .maybeSingle();
  if (currentErr) return { error: currentErr.message };
  if (!current) return { error: "No current phase to close." };

  if (end_date < current.start_date) {
    return { error: "End date can't be before the phase's start date." };
  }

  // Close current phase
  const { error: closeErr } = await supabase
    .from("phases")
    .update({ end_date })
    .eq("id", current.id);
  if (closeErr) return { error: closeErr.message };

  // Compute savings = Σ income − Σ expense for the closed phase.
  // At step 3, expenses/incomes tables exist but are empty; this will be 0.
  const [{ data: incomes }, { data: expenses }] = await Promise.all([
    supabase.from("incomes").select("amount").eq("phase_id", current.id),
    supabase.from("expenses").select("amount").eq("phase_id", current.id),
  ]);
  const sum = (rows: { amount: number }[] | null) =>
    (rows ?? []).reduce((a, r) => a + Number(r.amount), 0);
  const savings = sum(incomes) - sum(expenses);

  // Materialize phase_rollover money_source (even at 0, as a marker)
  const { error: msErr } = await supabase.from("money_sources").insert({
    user_id: user.id,
    name: `Rollover from ${current.name}`,
    amount: savings,
    date: end_date,
    kind: "phase_rollover",
    phase_id: current.id,
  });
  if (msErr) {
    // Best-effort rollback: reopen the phase
    await supabase.from("phases").update({ end_date: null }).eq("id", current.id);
    return { error: `Failed to create rollover: ${msErr.message}` };
  }

  // Open the new phase
  const start_date = addDaysISO(end_date, 1);
  const { error: newErr } = await supabase.from("phases").insert({
    user_id: user.id,
    name: new_name,
    start_date,
    end_date: null,
  });
  if (newErr) {
    // Best-effort rollback
    await supabase.from("money_sources").delete().eq("phase_id", current.id).eq("kind", "phase_rollover");
    await supabase.from("phases").update({ end_date: null }).eq("id", current.id);
    return { error: newErr.message };
  }

  revalidatePath("/phases");
  revalidatePath("/");
  return { ok: true };
}

export async function renamePhase(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return { error: "Name is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("phases").update({ name }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/phases");
  revalidatePath("/");
  return { ok: true };
}

export async function editFirstPhaseStartDate(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const start_date = String(formData.get("start_date") ?? "").trim();
  if (!id || !start_date) return { error: "Start date is required." };

  const supabase = await createClient();

  // Verify: this is the first phase (no phase has an earlier start_date)
  const { data: earlier } = await supabase
    .from("phases")
    .select("id")
    .lt("start_date", start_date)
    .neq("id", id)
    .limit(1);
  void earlier;

  const { data: phases } = await supabase
    .from("phases")
    .select("id, start_date")
    .order("start_date", { ascending: true })
    .limit(1);
  if (!phases || phases.length === 0 || phases[0].id !== id) {
    return { error: "Only the first-ever phase's start date is editable." };
  }

  // Verify no entry pre-dates the new start_date
  const [exp, inc] = await Promise.all([
    supabase.from("expenses").select("id").lt("date", start_date).limit(1),
    supabase.from("incomes").select("id").lt("date", start_date).limit(1),
  ]);
  if ((exp.data?.length ?? 0) > 0 || (inc.data?.length ?? 0) > 0) {
    return { error: "An expense or income pre-dates this new start date." };
  }

  const { error } = await supabase.from("phases").update({ start_date }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/phases");
  revalidatePath("/");
  return { ok: true };
}

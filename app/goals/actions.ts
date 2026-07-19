"use server";

import { revalidatePath } from "next/cache";
import { DEMO_WRITE_ERROR, isDemoWriteBlocked } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import type { GoalStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export async function createGoal(formData: FormData) {
  if (await isDemoWriteBlocked()) return { error: DEMO_WRITE_ERROR };
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const end_date = String(formData.get("end_date") ?? "").trim();
  const present_cost = Number(formData.get("present_cost"));
  const inflation_rate = Number(formData.get("inflation_rate"));

  if (!name || !end_date || !Number.isFinite(present_cost) || present_cost <= 0) {
    return { error: "Name, target date, and a positive present cost are required." };
  }
  if (!Number.isFinite(inflation_rate) || inflation_rate < 0) {
    return { error: "Inflation must be zero or positive." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: goal, error } = await supabase
    .from("goals")
    .insert({ user_id: user.id, name, description, end_date, present_cost, inflation_rate })
    .select("id")
    .single();
  if (error || !goal) return { error: error?.message ?? "Insert failed." };

  revalidatePath("/goals");
  return { ok: true, id: goal.id };
}

export async function updateGoal(formData: FormData) {
  if (await isDemoWriteBlocked()) return { error: DEMO_WRITE_ERROR };
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const end_date = String(formData.get("end_date") ?? "").trim();
  const present_cost = Number(formData.get("present_cost"));
  const inflation_rate = Number(formData.get("inflation_rate"));

  if (!id || !name || !end_date || !Number.isFinite(present_cost) || present_cost <= 0) {
    return { error: "Name, target date, and a positive present cost are required." };
  }
  if (!Number.isFinite(inflation_rate) || inflation_rate < 0) {
    return { error: "Inflation must be zero or positive." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("goals")
    .update({
      name,
      description,
      end_date,
      present_cost,
      inflation_rate,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/goals");
  revalidatePath(`/goals/${id}`);
  return { ok: true };
}

export async function setGoalStatus(formData: FormData) {
  if (await isDemoWriteBlocked()) return { error: DEMO_WRITE_ERROR };
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as GoalStatus;
  if (!id || !["active", "achieved", "archived"].includes(status)) {
    return { error: "Invalid status." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("goals").update({ status }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/goals");
  revalidatePath(`/goals/${id}`);
  return { ok: true };
}

export async function deleteGoal(formData: FormData) {
  if (await isDemoWriteBlocked()) return { error: DEMO_WRITE_ERROR };
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing goal." };
  const supabase = await createClient();
  // goal_allocations cascade on goal delete.
  const { error } = await supabase.from("goals").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/goals");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Glide path
// ---------------------------------------------------------------------------

export type GlideRow = {
  asset_class_id: string;
  months_before_end: number;
  target_pct: number;
};

/**
 * Replace a goal's entire glide path. Rows are grouped by milestone
 * (months_before_end); each milestone's target_pct must sum to ~100.
 */
export async function saveGlidePath(goalId: string, rows: GlideRow[]) {
  if (await isDemoWriteBlocked()) return { error: DEMO_WRITE_ERROR };
  if (!goalId) return { error: "Missing goal." };

  const clean = rows.filter(
    (r) => r.asset_class_id && Number.isFinite(r.months_before_end) && Number(r.target_pct) > 0,
  );

  // Validate each milestone sums to ~100%.
  const byMilestone = new Map<number, number>();
  for (const r of clean) {
    if (r.months_before_end < 0 || r.target_pct < 0 || r.target_pct > 100) {
      return { error: "Allocations must be between 0 and 100%." };
    }
    byMilestone.set(r.months_before_end, (byMilestone.get(r.months_before_end) ?? 0) + Number(r.target_pct));
  }
  for (const [m, sum] of byMilestone) {
    if (Math.abs(sum - 100) > 0.5) {
      return { error: `Allocation at ${m} months out sums to ${sum.toFixed(0)}%, must be 100%.` };
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error: delErr } = await supabase.from("goal_allocations").delete().eq("goal_id", goalId);
  if (delErr) return { error: delErr.message };

  if (clean.length > 0) {
    const { error: insErr } = await supabase.from("goal_allocations").insert(
      clean.map((r) => ({
        user_id: user.id,
        goal_id: goalId,
        asset_class_id: r.asset_class_id,
        months_before_end: Math.round(r.months_before_end),
        target_pct: r.target_pct,
      })),
    );
    if (insErr) return { error: insErr.message };
  }

  revalidatePath("/goals");
  revalidatePath(`/goals/${goalId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Asset classes (vocabulary + appreciation assumptions)
// ---------------------------------------------------------------------------

export async function createAssetClass(formData: FormData) {
  if (await isDemoWriteBlocked()) return { error: DEMO_WRITE_ERROR };
  const name = String(formData.get("name") ?? "").trim();
  const expected_return = Number(formData.get("expected_return"));
  if (!name) return { error: "Name is required." };
  if (!Number.isFinite(expected_return)) return { error: "Expected return must be a number." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("asset_classes")
    .insert({ user_id: user.id, name, expected_return });
  if (error) {
    if (error.code === "23505") return { error: "An asset class with that name already exists." };
    return { error: error.message };
  }
  revalidatePath("/goals");
  revalidatePath("/investments");
  return { ok: true };
}

export async function updateAssetClass(formData: FormData) {
  if (await isDemoWriteBlocked()) return { error: DEMO_WRITE_ERROR };
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const expected_return = Number(formData.get("expected_return"));
  if (!id || !name) return { error: "Name is required." };
  if (!Number.isFinite(expected_return)) return { error: "Expected return must be a number." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("asset_classes")
    .update({ name, expected_return })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "An asset class with that name already exists." };
    return { error: error.message };
  }
  revalidatePath("/goals");
  revalidatePath("/investments");
  return { ok: true };
}

export async function deleteAssetClass(formData: FormData) {
  if (await isDemoWriteBlocked()) return { error: DEMO_WRITE_ERROR };
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing asset class." };
  const supabase = await createClient();
  const { error } = await supabase.from("asset_classes").delete().eq("id", id);
  if (error) {
    // FK restrict: still referenced by investments or glide paths.
    if (error.code === "23503") {
      return { error: "In use by an investment or a goal plan — reassign those first." };
    }
    return { error: error.message };
  }
  revalidatePath("/goals");
  revalidatePath("/investments");
  return { ok: true };
}

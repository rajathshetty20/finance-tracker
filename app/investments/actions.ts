"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { InvestmentEntryType } from "@/lib/types";

/**
 * Resolve a free-typed asset-class name to an asset_classes row id, creating it
 * if new. Returns null for a blank name. Keeps the old "type a kind" UX while
 * normalizing into the controlled asset_classes vocabulary.
 */
async function resolveAssetClassId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  rawName: string,
): Promise<string | null> {
  const name = rawName.trim();
  if (!name) return null;
  const { data: existing } = await supabase
    .from("asset_classes")
    .select("id")
    .eq("user_id", userId)
    .eq("name", name)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created } = await supabase
    .from("asset_classes")
    .insert({ user_id: userId, name })
    .select("id")
    .single();
  return created?.id ?? null;
}

export async function createInvestment(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const assetClassName = String(formData.get("asset_class") ?? "");
  const date = String(formData.get("date") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const total_value = Number(formData.get("total_value"));
  if (!name || !date || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(total_value) || total_value < 0) {
    return { error: "Name, date, positive amount, and total value are required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const asset_class_id = await resolveAssetClassId(supabase, user.id, assetClassName);

  const { data: inv, error: invErr } = await supabase
    .from("investments")
    .insert({
      user_id: user.id,
      name,
      asset_class_id,
      status: "open",
      opened_on: date,
    })
    .select("id")
    .single();
  if (invErr || !inv) return { error: invErr?.message ?? "Insert failed." };

  const { error: entryErr } = await supabase.from("investment_entries").insert({
    user_id: user.id,
    investment_id: inv.id,
    date,
    entry_type: "contribution",
    amount,
    total_value_after: total_value,
  });
  if (entryErr) {
    await supabase.from("investments").delete().eq("id", inv.id);
    return { error: entryErr.message };
  }

  revalidatePath("/investments");
  return { ok: true };
}

export async function updateInvestmentAssetClass(formData: FormData) {
  const investment_id = String(formData.get("investment_id") ?? "");
  const assetClassName = String(formData.get("asset_class") ?? "");
  if (!investment_id) return { error: "Missing investment." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const asset_class_id = await resolveAssetClassId(supabase, user.id, assetClassName);
  const { error } = await supabase
    .from("investments")
    .update({ asset_class_id })
    .eq("id", investment_id);
  if (error) return { error: error.message };

  revalidatePath(`/investments/${investment_id}`);
  revalidatePath("/investments");
  revalidatePath("/goals");
  return { ok: true };
}

export async function addInvestmentEntry(formData: FormData) {
  const investment_id = String(formData.get("investment_id") ?? "");
  const entry_type = String(formData.get("entry_type") ?? "") as InvestmentEntryType;
  const date = String(formData.get("date") ?? "").trim();
  const rawAmount = Number(formData.get("amount"));
  const total_value = Number(formData.get("total_value"));
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!investment_id || !date || !Number.isFinite(total_value) || total_value < 0) {
    return { error: "Date and total value are required." };
  }
  if (!["contribution", "withdrawal", "valuation"].includes(entry_type)) {
    return { error: "Invalid entry type." };
  }
  const amount = entry_type === "valuation" ? 0 : rawAmount;
  if (entry_type !== "valuation" && (!Number.isFinite(amount) || amount <= 0)) {
    return { error: "Amount must be positive." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: inv } = await supabase
    .from("investments")
    .select("status, opened_on")
    .eq("id", investment_id)
    .maybeSingle();
  if (!inv) return { error: "Investment not found." };
  if (inv.status !== "open") return { error: "Investment is closed." };
  if (date < inv.opened_on) return { error: "Date cannot be before the investment's open date." };

  const { error } = await supabase.from("investment_entries").insert({
    user_id: user.id,
    investment_id,
    date,
    entry_type,
    amount,
    total_value_after: total_value,
    note,
  });
  if (error) return { error: error.message };

  revalidatePath(`/investments/${investment_id}`);
  revalidatePath("/investments");
  return { ok: true };
}

export async function closeInvestment(formData: FormData) {
  const investment_id = String(formData.get("investment_id") ?? "");
  const proceeds = Number(formData.get("proceeds"));
  const close_date = String(formData.get("close_date") ?? "").trim();
  if (!investment_id || !close_date || !Number.isFinite(proceeds) || proceeds < 0) {
    return { error: "Date and non-negative proceeds are required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: inv } = await supabase
    .from("investments")
    .select("id, status, name")
    .eq("id", investment_id)
    .maybeSingle();
  if (!inv) return { error: "Investment not found." };
  if (inv.status !== "open") return { error: "Already closed." };

  // pre_close_book = Σ contribution.amount − Σ withdrawal.amount
  const { data: entries } = await supabase
    .from("investment_entries")
    .select("entry_type, amount")
    .eq("investment_id", investment_id);
  const pre_close_book = (entries ?? []).reduce((acc, e) => {
    if (e.entry_type === "contribution") return acc + Number(e.amount);
    if (e.entry_type === "withdrawal") return acc - Number(e.amount);
    return acc;
  }, 0);

  // Final withdrawal entry — only if proceeds > 0. The DB CHECK
  // ((entry_type='valuation') = (amount=0)) forbids zero-amount withdrawals.
  // When proceeds = 0 (position liquidated to nothing), we skip the entry; the
  // realized_gain money_source below captures the full loss.
  if (proceeds > 0) {
    const { error: e1 } = await supabase.from("investment_entries").insert({
      user_id: user.id,
      investment_id,
      date: close_date,
      entry_type: "withdrawal",
      amount: proceeds,
      total_value_after: 0,
      note: "Close-out",
    });
    if (e1) return { error: e1.message };
  }

  // Realized gain money_source (signed)
  const realized = proceeds - pre_close_book;
  const labelPrefix = realized >= 0 ? "Gain from" : "Loss from";
  const { error: e2 } = await supabase.from("money_sources").insert({
    user_id: user.id,
    name: `${labelPrefix} ${inv.name}`,
    amount: realized,
    date: close_date,
    kind: "realized_gain",
    investment_id,
  });
  if (e2) return { error: e2.message };

  // Mark closed
  const { error: e3 } = await supabase
    .from("investments")
    .update({ status: "closed", closed_on: close_date })
    .eq("id", investment_id);
  if (e3) return { error: e3.message };

  revalidatePath(`/investments/${investment_id}`);
  revalidatePath("/investments");
  revalidatePath("/money-sources");
  return { ok: true };
}

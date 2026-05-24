"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createDebt(formData: FormData) {
  const description = String(formData.get("description") ?? "").trim();
  const principal = Number(formData.get("principal"));
  const total_payable = Number(formData.get("total_payable"));
  const start_date = String(formData.get("start_date") ?? "").trim();

  if (!description || !start_date || !Number.isFinite(principal) || principal <= 0 || !Number.isFinite(total_payable)) {
    return { error: "Description, start date, positive principal, and total payable are required." };
  }
  if (total_payable < principal) {
    return { error: "Total payable cannot be less than principal." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("debts").insert({
    user_id: user.id,
    description,
    principal,
    total_payable,
    start_date,
    status: "open",
  });
  if (error) return { error: error.message };

  revalidatePath("/debts");
  return { ok: true };
}

export async function addDebtPayment(formData: FormData) {
  const debt_id = String(formData.get("debt_id") ?? "");
  const date = String(formData.get("date") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!debt_id || !date || !Number.isFinite(amount) || amount <= 0) {
    return { error: "Date and positive amount are required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: debt } = await supabase
    .from("debts")
    .select("status, start_date, total_payable")
    .eq("id", debt_id)
    .maybeSingle();
  if (!debt) return { error: "Debt not found." };
  if (debt.status !== "open") return { error: "Debt is closed." };
  if (date < debt.start_date) return { error: "Date cannot be before the debt's start." };

  const { error } = await supabase.from("debt_payments").insert({
    user_id: user.id,
    debt_id,
    date,
    amount,
    note,
  });
  if (error) return { error: error.message };

  revalidatePath(`/debts/${debt_id}`);
  revalidatePath("/debts");
  return { ok: true };
}

export async function closeDebt(formData: FormData) {
  const debt_id = String(formData.get("debt_id") ?? "");
  const close_date = String(formData.get("close_date") ?? "").trim();
  if (!debt_id || !close_date) return { error: "Close date is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: debt } = await supabase
    .from("debts")
    .select("id, status, principal, description")
    .eq("id", debt_id)
    .maybeSingle();
  if (!debt) return { error: "Debt not found." };
  if (debt.status !== "open") return { error: "Already closed." };

  // Sum of payments
  const { data: payments } = await supabase
    .from("debt_payments")
    .select("amount")
    .eq("debt_id", debt_id);
  const sumPaid = (payments ?? []).reduce((a, p) => a + Number(p.amount), 0);

  // debt_closure amount = principal − Σ payments (signed)
  const closureAmount = Number(debt.principal) - sumPaid;
  const labelPrefix = closureAmount >= 0 ? "Forgiveness on" : "Interest realized on";

  const { error: e1 } = await supabase.from("money_sources").insert({
    user_id: user.id,
    name: `${labelPrefix} ${debt.description}`,
    amount: closureAmount,
    date: close_date,
    kind: "debt_closure",
    debt_id,
  });
  if (e1) return { error: e1.message };

  const { error: e2 } = await supabase
    .from("debts")
    .update({ status: "closed", closed_on: close_date })
    .eq("id", debt_id);
  if (e2) return { error: e2.message };

  revalidatePath(`/debts/${debt_id}`);
  revalidatePath("/debts");
  revalidatePath("/money-sources");
  return { ok: true };
}

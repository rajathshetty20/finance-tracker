import { createClient } from "@/lib/supabase/server";
import type { EntryWithJoins } from "@/lib/types";
import { appToday } from "@/lib/demo";
import { inWindow, parseRange, rangeLabel, rangeWindow } from "@/lib/range";

/**
 * CSV of exactly the rows the ledger is currently showing.
 *
 * It reads the same query parameters the page does, so an export can never be
 * a different set from what was on screen — the filename names the filter so a
 * file found later still says what it contains.
 */
function csvCell(v: string | number | null): string {
  const s = v === null ? "" : String(v);
  // Excel and Sheets both treat a leading =, +, - or @ as a formula.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ledger = url.searchParams.get("ledger") === "incomes" ? "incomes" : "expenses";
  const range = parseRange(url.searchParams.get("range") ?? undefined);
  const cat = url.searchParams.get("cat") ?? "";
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in.", { status: 401 });

  const today = await appToday();
  const { data } = await supabase
    .from(ledger)
    .select("*, category:categories(id, name), phase:phases(id, name, end_date)")
    .order("date", { ascending: false });

  const win = rangeWindow(range, today);
  const rows = ((data ?? []) as EntryWithJoins[]).filter((e) => {
    if (!inWindow(e.date, win)) return false;
    if (cat && e.category_id !== cat) return false;
    if (q) {
      const hay = `${e.note ?? ""} ${e.category?.name ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const header = ["date", "category", "amount", "note", "phase"];
  const lines = [
    header.join(","),
    ...rows.map((e) =>
      [
        e.date,
        e.category?.name ?? "",
        Number(e.amount),
        e.note ?? "",
        e.phase?.name ?? "",
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  // A total row, so a file opened months later can be checked against the
  // screen it came from without re-summing it.
  lines.push(["", "TOTAL", rows.reduce((a, e) => a + Number(e.amount), 0), "", ""].map(csvCell).join(","));

  const slug = rangeLabel(range, today).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const filename = `${ledger}-${slug}${cat ? "-filtered" : ""}.csv`;

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

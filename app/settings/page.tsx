import { createClient } from "@/lib/supabase/server";
import type { Category } from "@/lib/types";
import NewCategoryForm from "./NewCategoryForm";
import CategoryRow from "./CategoryRow";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("*")
    .order("name", { ascending: true });
  const categories = (data ?? []) as Category[];

  const expenseCats = categories.filter((c) => c.kind === "expense");
  const incomeCats = categories.filter((c) => c.kind === "income");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Categories</h1>
        <p className="text-sm text-zinc-500">
          Tags for expenses and incomes. A category can&apos;t be deleted while entries reference it.
        </p>
      </header>

      <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-medium text-zinc-500">Expense categories</h2>
        <NewCategoryForm kind="expense" />
        {expenseCats.length > 0 && (
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {expenseCats.map((c) => (
              <CategoryRow key={c.id} category={c} />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-medium text-zinc-500">Income categories</h2>
        <NewCategoryForm kind="income" />
        {incomeCats.length > 0 && (
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {incomeCats.map((c) => (
              <CategoryRow key={c.id} category={c} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

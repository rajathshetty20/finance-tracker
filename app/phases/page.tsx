import { createClient } from "@/lib/supabase/server";
import type { Phase } from "@/lib/types";
import FirstPhaseForm from "./FirstPhaseForm";
import EndAndStartForm from "./EndAndStartForm";
import PhaseRow from "./PhaseRow";

export default async function PhasesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("phases")
    .select("*")
    .order("start_date", { ascending: false });
  const phases = (data ?? []) as Phase[];

  const current = phases.find((p) => p.end_date === null) ?? null;
  const firstPhaseId = phases.length > 0 ? phases[phases.length - 1].id : null;
  const onlyOnePhase = phases.length === 1;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Phases</h1>
        <p className="text-sm text-zinc-500">
          A phase is a period of life — a job, a sabbatical, whatever marks a meaningful change. Expenses and incomes auto-attach to the phase whose date range contains them.
        </p>
      </header>

      {phases.length === 0 ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-medium text-zinc-500">Create your first phase</h2>
          <FirstPhaseForm />
        </section>
      ) : (
        <>
          <section>
            <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
              {phases.map((p) => (
                <PhaseRow
                  key={p.id}
                  phase={p}
                  canEditStart={onlyOnePhase && p.id === firstPhaseId}
                />
              ))}
            </ul>
          </section>

          {current && (
            <section>
              <EndAndStartForm currentName={current.name} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

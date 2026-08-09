/**
 * A write that was refused.
 *
 * The demo's refusal message is a full sentence, and inline inside a flex row
 * it stretched the row, pushed the amount out of its column and wrapped
 * mid-number. Errors get their own full-width block under the row instead,
 * where a sentence can be a sentence.
 */
export default function FormError({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p className="mt-1.5 rounded-lg border border-down/30 bg-down-soft px-2.5 py-1.5 text-[0.75rem] leading-snug text-ink-2">
      {children}
    </p>
  );
}

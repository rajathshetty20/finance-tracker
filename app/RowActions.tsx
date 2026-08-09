"use client";

import { Pencil, Trash2 } from "lucide-react";

/**
 * Edit and delete for a list row.
 *
 * Previously the words "edit" and "delete" in red and grey on every row of
 * every list — in a 60-row ledger that is 120 pieces of text competing with
 * the amounts, which is the thing you actually came to read. Icons carry the
 * same two actions at a fraction of the visual weight, with the words kept as
 * accessible labels.
 */
export default function RowActions({
  onEdit,
  onDelete,
  disabled,
  editLabel = "Edit",
  deleteLabel = "Delete",
}: {
  onEdit?: () => void;
  onDelete?: () => void;
  disabled?: boolean;
  editLabel?: string;
  deleteLabel?: string;
}) {
  return (
    <span className="flex shrink-0 items-center">
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={editLabel}
          title={editLabel}
          className="-my-1 inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          aria-label={deleteLabel}
          title={deleteLabel}
          className="-my-1 inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-down disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}

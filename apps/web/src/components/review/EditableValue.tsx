/**
 * A value a person can correct, or a missing one they can fill in — in place.
 *
 * Used wherever we show what was read from a document (the review after a
 * read, the document page in the library), so fact-checking a value and fixing
 * it are the same gesture: look at the document, click the value, type.
 */
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Pencil, Plus, X } from "lucide-react";

export interface EditableValueProps {
  /** What is shown now. Null means nothing was read — the control offers "Add". */
  value: string | null;
  /** The field's name, for the input's accessible label. */
  label: string;
  /** Persist the new value. Throw to keep the editor open with the message. */
  onSave: (next: string) => Promise<void> | void;
  testId: string;
  /** Read-only viewers see the value without the control. */
  disabled?: boolean;
}

export function EditableValue({ value, label, onSave, testId, disabled = false }: EditableValueProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const open = () => {
    setDraft(value ?? "");
    setError(null);
    setEditing(true);
  };
  const cancel = () => {
    setEditing(false);
    setError(null);
  };
  const save = async () => {
    const next = draft.trim();
    if (!next || next === (value ?? "")) return cancel();
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this value.");
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="min-w-0" data-testid={`${testId}-editor`}>
        <div className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") cancel();
            }}
            aria-label={label}
            disabled={saving}
            className="h-8 min-w-0 flex-1 rounded-lg border border-violet-500/40 bg-[color:var(--ink)] px-2.5 text-[12.5px] text-white outline-none focus:ring-2 focus:ring-violet-500/15"
            data-testid={`${testId}-input`}
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !draft.trim()}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#0e0e10] hover:bg-[#f2f2f7] disabled:opacity-40"
            aria-label={`Save ${label}`}
            data-testid={`${testId}-save`}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.12] text-[color:var(--body)] hover:bg-white/[0.06]"
            aria-label="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {error && <p className="mt-1 text-[11px] text-red-300" role="alert">{error}</p>}
      </div>
    );
  }

  if (disabled) return <span className="break-words">{value ?? "—"}</span>;

  return value == null ? (
    <button
      type="button"
      onClick={open}
      className="inline-flex items-center gap-1 rounded-md border border-dashed border-amber-400/40 px-2 py-0.5 text-[11.5px] font-medium text-amber-200 hover:bg-amber-500/[0.08]"
      data-testid={`${testId}-add`}
    >
      <Plus className="h-3 w-3" /> Add value
    </button>
  ) : (
    <button
      type="button"
      onClick={open}
      title="Correct this value"
      className="group inline-flex max-w-full items-start gap-1.5 rounded-md text-left hover:bg-white/[0.05]"
      data-testid={`${testId}-edit`}
    >
      <span className="break-words">{value}</span>
      <Pencil className="mt-0.5 h-3 w-3 shrink-0 text-[color:var(--muted)] opacity-60 group-hover:opacity-100" aria-hidden />
      <span className="sr-only">Edit {label}</span>
    </button>
  );
}

export default EditableValue;

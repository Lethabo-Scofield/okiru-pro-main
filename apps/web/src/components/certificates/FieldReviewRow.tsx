import { useState, type ReactNode } from 'react';
import { AlertTriangle, Check, CheckCircle2, CircleDashed, Loader2, Pencil, X } from 'lucide-react';
import { OKIRU_HUB_SECTORS } from '@/lib/okiruHubSectors';
import { sourceLabel, stateLabel, type FieldState, type ResolvedField } from '@/lib/certificateFieldState';

export type ReviewAction = 'confirm' | 'edit' | 'reject';

const SIZES = ['EME', 'QSE', 'Generic', 'Large', 'Specialised', 'Micro', 'Small', 'Medium'] as const;

const STATE_STYLE: Record<FieldState, { chip: string; value: string; icon: ReactNode }> = {
  confirmed: {
    chip: 'bg-emerald-500/12 text-emerald-700 border-emerald-500/30',
    value: 'text-[#18181b]',
    icon: <CheckCircle2 className="h-3 w-3" aria-hidden />,
  },
  needs_review: {
    chip: 'bg-amber-500/14 text-amber-700 border-amber-500/40',
    value: 'text-amber-700',
    icon: <AlertTriangle className="h-3 w-3" aria-hidden />,
  },
  missing: {
    chip: 'bg-zinc-500/10 text-zinc-600 border-zinc-400/40',
    value: 'text-[color:var(--body)]',
    icon: <CircleDashed className="h-3 w-3" aria-hidden />,
  },
};

/** Value for the edit control: dates need YYYY-MM-DD, everything else is plain text. */
function editSeed(field: ResolvedField): string {
  const raw = field.candidate?.raw ?? field.raw;
  if (raw == null) return '';
  return field.input === 'date' ? String(raw).slice(0, 10) : String(raw);
}

/**
 * One metadata field of a certificate: its state (Confirmed / Needs review /
 * Missing), its value or held candidate, and what a person can do about it.
 *
 * A held candidate is shown with its value, confidence and source rather than as a
 * blank. Confirm saves exactly that value as trusted; Edit saves a corrected one;
 * Reject keeps the candidate on record but stops it being proposed again. Each
 * action resolves only THIS field.
 */
export function FieldReviewRow({
  field,
  busy = false,
  canResolve = true,
  onResolve,
}: {
  field: ResolvedField;
  busy?: boolean;
  canResolve?: boolean;
  onResolve: (key: ResolvedField['key'], action: ReviewAction, value?: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);

  const style = STATE_STYLE[field.state];
  const candidate = field.candidate;
  const ambiguous = field.state === 'needs_review' && !!candidate?.ambiguous;
  const meta = [
    candidate?.confidence != null ? `${Math.round(candidate.confidence * 100)}% confidence` : null,
    sourceLabel(candidate?.source ?? null) ? `from ${sourceLabel(candidate?.source ?? null)}` : null,
  ].filter(Boolean).join(' · ');

  const startEdit = () => {
    setDraft(editSeed(field));
    setEditing(true);
  };
  const submitEdit = async () => {
    await onResolve(field.key, 'edit', draft);
    setEditing(false);
  };

  const sizeOptions = Array.from(new Set([...(draft && !SIZES.includes(draft as never) ? [draft] : []), ...SIZES]));

  return (
    <div className="rounded-lg border border-[color:var(--rule)] bg-white px-3 py-2.5" data-testid={`field-${field.key}`} data-state={field.state}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-[color:var(--muted)]">{field.label}</span>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${style.chip}`}
          data-testid={`state-${field.key}`}
        >
          {style.icon}
          {stateLabel(field.state)}
        </span>
      </div>

      {editing ? (
        <div className="flex items-center gap-2">
          {field.input === 'size' ? (
            <select
              aria-label={field.label}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-[color:var(--rule)] bg-white px-2 py-1.5 text-[13px] text-[#18181b]"
            >
              <option value="">Choose…</option>
              {sizeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : field.input === 'sector' ? (
            <select
              aria-label={field.label}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-[color:var(--rule)] bg-white px-2 py-1.5 text-[13px] text-[#18181b]"
            >
              <option value="">Choose…</option>
              {OKIRU_HUB_SECTORS.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
          ) : (
            <input
              aria-label={field.label}
              value={draft}
              type={field.input === 'date' ? 'date' : field.input === 'number' ? 'number' : 'text'}
              step={field.input === 'number' ? '0.01' : undefined}
              onChange={(e) => setDraft(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-[color:var(--rule)] bg-white px-2 py-1.5 text-[13px] text-[#18181b]"
            />
          )}
          <button
            type="button"
            onClick={submitEdit}
            disabled={busy || !draft.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-[#18181b] px-2.5 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
            data-testid={`save-${field.key}`}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
          </button>
          <button type="button" onClick={() => setEditing(false)} className="rounded-md px-2 py-1.5 text-[12px] text-[color:var(--body)]" data-testid={`cancel-${field.key}`}>
            Cancel
          </button>
        </div>
      ) : (
        <>
          {ambiguous && candidate ? (
            <fieldset className="space-y-1" data-testid={`choices-${field.key}`}>
              <legend className="mb-1 text-[11px] text-amber-700">Several values were found - choose the right one</legend>
              {candidate.alternatives.map((alt) => (
                <label key={String(alt.raw)} className="flex cursor-pointer items-start gap-2 rounded-md border border-[color:var(--rule)] px-2 py-1.5 text-[12px]">
                  <input
                    type="radio"
                    name={`choice-${field.key}`}
                    value={String(alt.raw)}
                    checked={chosen === String(alt.raw)}
                    onChange={() => setChosen(String(alt.raw))}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-[#18181b]">{alt.display}</span>
                    {alt.snippet && <span className="line-clamp-2 block text-[11px] text-[color:var(--body)]">{alt.snippet}</span>}
                  </span>
                </label>
              ))}
            </fieldset>
          ) : (
            <div className={`truncate text-[13px] font-medium ${style.value}`} data-testid={`value-${field.key}`}>
              {field.display ?? 'Missing'}
            </div>
          )}

          {field.state === 'needs_review' && meta && <p className="mt-0.5 text-[11px] text-amber-700/90">{meta}</p>}
          {field.note && <p className="mt-0.5 line-clamp-2 text-[11px] text-[color:var(--body)]">{field.note}</p>}
          {field.state === 'confirmed' && field.confirmedByPerson && <p className="mt-0.5 text-[11px] text-[color:var(--body)]">Confirmed by a person</p>}

          {canResolve && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {field.state === 'needs_review' && (
                <>
                  <button
                    type="button"
                    onClick={() => onResolve(field.key, 'confirm', ambiguous ? chosen ?? undefined : undefined)}
                    disabled={busy || (ambiguous && !chosen)}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-[12px] font-medium text-white disabled:opacity-50"
                    data-testid={`confirm-${field.key}`}
                  >
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Confirm
                  </button>
                  <button type="button" onClick={startEdit} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-[color:var(--rule)] px-2.5 py-1 text-[12px] text-[#18181b] disabled:opacity-50" data-testid={`edit-${field.key}`}>
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  <button type="button" onClick={() => onResolve(field.key, 'reject')} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-[color:var(--rule)] px-2.5 py-1 text-[12px] text-[color:var(--body)] disabled:opacity-50" data-testid={`reject-${field.key}`}>
                    <X className="h-3 w-3" /> Reject
                  </button>
                </>
              )}
              {field.state === 'confirmed' && (
                <button type="button" onClick={startEdit} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-[color:var(--rule)] px-2.5 py-1 text-[12px] text-[color:var(--body)] disabled:opacity-50" data-testid={`edit-${field.key}`}>
                  <Pencil className="h-3 w-3" /> Edit
                </button>
              )}
              {field.state === 'missing' && (
                <button type="button" onClick={startEdit} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-[color:var(--rule)] px-2.5 py-1 text-[12px] text-[#18181b] disabled:opacity-50" data-testid={`edit-${field.key}`}>
                  <Pencil className="h-3 w-3" /> Add value
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

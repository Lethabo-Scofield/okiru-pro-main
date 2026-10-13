import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";

/**
 * The company's own reduction levers (D5) — `NetZero_Roadmap!A20:F27`.
 *
 * The roadmap read them and the server stored them, but nothing let anyone
 * type one in, so every company's roadmap ended "No net-zero levers captured".
 * The levers are the company's plan, not ours: the page once shipped the source
 * client's list, owners and all, to everybody who opened it.
 *
 * Columns follow the workbook: A lever, B action, D target, E timeline,
 * F owner (C is the workbook's own and is left as it is).
 */
export interface NetZeroLeverDraft {
  lever: string;
  action: string;
  target: string;
  timeline: string;
  owner: string;
}

export const LEVER_FIRST_ROW = 20;
export const LEVER_LAST_ROW = 27;
export const MAX_LEVERS = LEVER_LAST_ROW - LEVER_FIRST_ROW + 1;

const FIELD_COLUMNS: ReadonlyArray<[keyof NetZeroLeverDraft, string]> = [
  ["lever", "A"],
  ["action", "B"],
  ["target", "D"],
  ["timeline", "E"],
  ["owner", "F"],
];

const text = (v: unknown) => (v == null ? "" : String(v).trim());

/** The levers a `netzero` section holds, in row order. */
export function leversFromCells(cells: Record<string, unknown> | undefined): NetZeroLeverDraft[] {
  const out: NetZeroLeverDraft[] = [];
  for (let row = LEVER_FIRST_ROW; row <= LEVER_LAST_ROW; row++) {
    const draft = Object.fromEntries(
      FIELD_COLUMNS.map(([field, col]) => [field, text(cells?.[`${col}${row}`])]),
    ) as unknown as NetZeroLeverDraft;
    if (draft.lever) out.push(draft);
  }
  return out;
}

/**
 * The section with these levers written in, from row 20 down.
 *
 * Every other cell the section holds is kept; the lever cells of all eight rows
 * are rewritten, so a lever removed here is removed there. A lever with no name
 * is not a lever and is dropped.
 */
export function cellsWithLevers(
  cells: Record<string, unknown> | undefined,
  levers: readonly NetZeroLeverDraft[],
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(cells ?? {}) };
  for (let row = LEVER_FIRST_ROW; row <= LEVER_LAST_ROW; row++) {
    for (const [, col] of FIELD_COLUMNS) delete out[`${col}${row}`];
  }
  levers
    .filter((l) => l.lever.trim() !== "")
    .slice(0, MAX_LEVERS)
    .forEach((l, i) => {
      for (const [field, col] of FIELD_COLUMNS) {
        const value = l[field].trim();
        if (value) out[`${col}${LEVER_FIRST_ROW + i}`] = value;
      }
    });
  return out;
}

const EMPTY: NetZeroLeverDraft = { lever: "", action: "", target: "", timeline: "", owner: "" };

const INPUT =
  "w-full rounded-md border border-[var(--esg-input-border,rgba(255,255,255,0.07))] bg-[var(--esg-input-bg,rgba(0,0,0,0.32))] px-2 py-1.5 text-[12px] text-[var(--esg-text)] disabled:opacity-60";

export function NetZeroLeversEditor({
  cells,
  locked,
  onSave,
}: {
  cells: Record<string, unknown> | undefined;
  /** A submitted workbook is read-only. */
  locked: boolean;
  onSave: (cells: Record<string, unknown>) => Promise<void>;
}) {
  const [rows, setRows] = useState<NetZeroLeverDraft[]>(() => leversFromCells(cells));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  // A workbook that changes underneath (another tab saved, an import landed)
  // replaces the rows — unless the person is mid-edit.
  useEffect(() => {
    if (!dirty) setRows(leversFromCells(cells));
  }, [cells, dirty]);

  const edit = (i: number, field: keyof NetZeroLeverDraft, value: string) => {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [field]: value } : r)));
    setDirty(true);
    setMessage(null);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await onSave(cellsWithLevers(cells, rows));
      setDirty(false);
      setMessage({ kind: "ok", text: "Levers saved." });
    } catch {
      // The store throws a bare "save failed"; say what it means and keep the edits.
      setMessage({ kind: "error", text: "The levers were not saved. Your changes are still here — try again." });
    } finally {
      setSaving(false);
    }
  };

  const named = rows.filter((r) => r.lever.trim()).length;

  return (
    <div data-testid="esg-nz-levers">
      {rows.length === 0 ? (
        <p className="text-[12px] text-[var(--esg-text3)] mb-3">
          No reduction levers yet. Add the company&apos;s own: what it will change, by when, and who owns it.
        </p>
      ) : (
        <div className="overflow-x-auto mb-3">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[var(--esg-text3)]">
                <th className="pb-2 pr-2 font-medium">Lever</th>
                <th className="pb-2 pr-2 font-medium">Action</th>
                <th className="pb-2 pr-2 font-medium">Target</th>
                <th className="pb-2 pr-2 font-medium">Timeline</th>
                <th className="pb-2 pr-2 font-medium">Owner</th>
                <th className="pb-2" aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} data-testid={`esg-nz-lever-${i}`}>
                  {FIELD_COLUMNS.map(([field]) => (
                    <td key={field} className="py-1 pr-2 align-top">
                      <input
                        className={INPUT}
                        value={r[field]}
                        disabled={locked || saving}
                        aria-label={`Lever ${i + 1} ${field}`}
                        onChange={(e) => edit(i, field, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className="py-1 align-top">
                    <button
                      type="button"
                      onClick={() => {
                        setRows((rs) => rs.filter((_, j) => j !== i));
                        setDirty(true);
                        setMessage(null);
                      }}
                      disabled={locked || saving}
                      aria-label={`Remove lever ${i + 1}`}
                      className="p-1.5 rounded-md text-[var(--esg-text3)] hover:text-[var(--esg-text)] disabled:opacity-40"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setRows((rs) => [...rs, { ...EMPTY }]);
            setDirty(true);
          }}
          disabled={locked || saving || rows.length >= MAX_LEVERS}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--esg-glass-border)] px-3 py-1.5 text-[12px] text-[var(--esg-text2)] hover:text-[var(--esg-text)] disabled:opacity-50"
          data-testid="esg-nz-lever-add"
        >
          <Plus className="h-3.5 w-3.5" /> Add a lever
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={locked || saving || !dirty}
          className="rounded-lg bg-[var(--esg-acc-e,#22c55e)] px-3 py-1.5 text-[12px] font-semibold text-[#080e14] disabled:opacity-50"
          data-testid="esg-nz-lever-save"
        >
          {saving ? "Saving…" : `Save ${named === 1 ? "1 lever" : `${named} levers`}`}
        </button>
        {rows.length >= MAX_LEVERS ? (
          <span className="text-[11px] text-[var(--esg-text3)]">The roadmap holds {MAX_LEVERS} levers.</span>
        ) : null}
        {locked ? (
          <span className="text-[11px] text-[var(--esg-text3)]">The workbook is submitted; reopen it to change the levers.</span>
        ) : null}
        {message ? (
          <span
            role={message.kind === "error" ? "alert" : "status"}
            className={`text-[11px] ${message.kind === "error" ? "text-red-400" : "text-[var(--esg-text2)]"}`}
            data-testid="esg-nz-lever-message"
          >
            {message.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Loader2, Save } from "lucide-react";
import { SpreadsheetGrid } from "@/components/workbook/SpreadsheetGrid";
import { ESG_INPUT_SECTIONS, type EsgSectionDef } from "@/lib/esgSections";
import {
  esgGridSectionDef,
  isEsgGridSection,
  type EsgGridSectionId,
} from "@/lib/esgGridSections";
import {
  mergeEsgSectionCells,
  readEsgGridRows,
  type EsgGridRow,
} from "@/lib/esgGridRows";
import { useEsgStore } from "../../../EsgToolkit/src/lib/esgStore";

const SAVE_DEBOUNCE_MS = 800;

type FieldDef = {
  cell: string;
  label: string;
  type?: "number" | "text" | "select";
  options?: string[];
};

const SECTION_FIELDS: Record<string, FieldDef[]> = {
  assumptions: [
    { cell: "B9", label: "Stance floor (B9)", type: "number" },
    { cell: "B107", label: "Net-zero target year", type: "number" },
    { cell: "B55", label: "LTIFR threshold", type: "number" },
  ],
  "e-data": [
    { cell: "L19", label: "Fleet diesel YTD (L)", type: "number" },
    { cell: "L46", label: "Electricity kWh YTD", type: "number" },
    { cell: "L63", label: "Water kL YTD", type: "number" },
    { cell: "L75", label: "Scope 1 tCO₂e", type: "number" },
    { cell: "L82", label: "Scope 2 net tCO₂e", type: "number" },
    { cell: "_months_C_K", label: "Months with data (9 target)", type: "number" },
  ],
  "s-data": [
    { cell: "L12", label: "EE headcount (L12)", type: "number" },
    { cell: "G35", label: "LTIFR (G35)", type: "number" },
    { cell: "B45", label: "WSP submitted", type: "select", options: ["Yes", "No", "Partial"] },
    { cell: "B46", label: "ATR submitted", type: "select", options: ["Yes", "No", "Partial"] },
    { cell: "G29", label: "Incidents logged", type: "number" },
    { cell: "C59", label: "Fatigue programme active", type: "number" },
    { cell: "_initiatives_count", label: "Social initiatives count", type: "number" },
  ],
  "g-data": [
    { cell: "F13", label: "S&EC maturity (F13)", type: "number" },
    { cell: "F14", label: "ESG remuneration (F14)", type: "number" },
    { cell: "F15", label: "Code of ethics (F15)", type: "number" },
    { cell: "F16", label: "Whistleblower (F16)", type: "number" },
    { cell: "F17", label: "POPIA IO (F17)", type: "number" },
    { cell: "F18", label: "Cyber risk (F18)", type: "number" },
    { cell: "F19", label: "External assurance (F19)", type: "number" },
    { cell: "F20", label: "Integrated report (F20)", type: "number" },
    { cell: "F21", label: "Legal register (F21)", type: "number" },
    { cell: "F23", label: "Climate in register (F23)", type: "number" },
    { cell: "B25", label: "Regulatory penalties (blank=none)", type: "text" },
  ],
  ee: [
    { cell: "B9", label: "EE Plan submitted", type: "select", options: ["Yes", "Partial", "No"] },
    { cell: "B10", label: "EE forum active", type: "select", options: ["Yes", "Partial", "No"] },
    { cell: "B12", label: "EE targets set", type: "select", options: ["Yes", "Partial", "No"] },
    { cell: "B5", label: "% Black employees", type: "number" },
  ],
};

export type EsgWorkbookSectionEditorHandle = {
  flush: () => Promise<boolean>;
};

type Props = {
  sectionId: string;
  title?: string;
  autosave?: boolean;
};

export const EsgWorkbookSectionEditor = forwardRef<EsgWorkbookSectionEditorHandle, Props>(
  function EsgWorkbookSectionEditor({ sectionId, title, autosave = true }, ref) {
    if (isEsgGridSection(sectionId)) {
      return (
        <EsgGridSectionEditor
          ref={ref}
          sectionId={sectionId}
          title={title}
          autosave={autosave}
        />
      );
    }
    return (
      <EsgScalarSectionEditor
        ref={ref}
        sectionId={sectionId}
        title={title}
        autosave={autosave}
      />
    );
  },
);

const EsgGridSectionEditor = forwardRef<
  EsgWorkbookSectionEditorHandle,
  { sectionId: EsgGridSectionId; title?: string; autosave: boolean }
>(function EsgGridSectionEditor({ sectionId, title, autosave }, ref) {
  const def = esgGridSectionDef(sectionId)!;
  const { workbook, submittedAt, saving, updateSectionCells, recalculate } = useEsgStore();
  const [rows, setRows] = useState<EsgGridRow[]>([]);
  const rowsRef = useRef(rows);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locked = Boolean(submittedAt);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    const cells = workbook?.sections?.[sectionId]?.cells ?? {};
    setRows(readEsgGridRows(cells, sectionId));
  }, [workbook, sectionId]);

  const persist = useCallback(async (): Promise<boolean> => {
    const existing = workbook?.sections?.[sectionId]?.cells ?? {};
    const cells = mergeEsgSectionCells(sectionId, rowsRef.current, existing);
    try {
      await updateSectionCells(sectionId, cells);
      recalculate();
      return true;
    } catch {
      return false;
    }
  }, [sectionId, workbook, updateSectionCells, recalculate]);

  const scheduleSave = useCallback(() => {
    if (!autosave || locked) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void persist();
    }, SAVE_DEBOUNCE_MS);
  }, [autosave, locked, persist]);

  useImperativeHandle(
    ref,
    () => ({
      flush: async () => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        return persist();
      },
    }),
    [persist],
  );

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const columns = useMemo(() => def.columns, [def]);

  const handleRowsChange = (next: EsgGridRow[]) => {
    setRows(next);
    rowsRef.current = next;
    scheduleSave();
  };

  return (
    <div className="space-y-4" data-testid={`esg-workbook-section-${sectionId}`}>
      <header className="px-0">
        <h2 className="text-[18px] font-bold tracking-tight text-[var(--esg-text)]">
          {title ?? def.sheet}
        </h2>
        <p className="text-[13px] text-[var(--esg-text2)] mt-0.5">{def.description}</p>
        <p className="text-[11px] text-[var(--esg-text3)] mt-1">
          Paste from Excel (Ctrl+V) or edit cells inline. Changes autosave.
        </p>
      </header>

      <div className="overflow-hidden rounded-xl border border-[var(--esg-glass-border)] bg-black/20">
        <SpreadsheetGrid
          columns={columns}
          rows={rows}
          onChange={handleRowsChange}
          sectionLabel={def.sheet}
          sectionDescription={def.description}
          readOnly={locked}
          canAddRows={!locked}
          canDeleteRows={!locked}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void persist()}
          disabled={locked || saving === sectionId}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--esg-acc-e)] text-[#080e14] font-semibold text-[13px] disabled:opacity-50"
          data-testid={`esg-save-${sectionId}`}
        >
          {saving === sectionId ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save section
        </button>
        {saving === sectionId ? (
          <span className="text-[11px] text-[var(--esg-text3)]">Saving…</span>
        ) : null}
      </div>
    </div>
  );
});

const EsgScalarSectionEditor = forwardRef<
  EsgWorkbookSectionEditorHandle,
  { sectionId: string; title?: string; autosave: boolean }
>(function EsgScalarSectionEditor({ sectionId, title, autosave }, ref) {
  const section = ESG_INPUT_SECTIONS.find((s) => s.id === sectionId);
  const { workbook, submittedAt, saving, updateSectionCells, recalculate } = useEsgStore();
  const [draft, setDraft] = useState<Record<string, string | number | boolean | null>>({});
  const draftRef = useRef(draft);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locked = Boolean(submittedAt);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    const cells = workbook?.sections?.[sectionId]?.cells ?? {};
    setDraft({ ...cells });
  }, [workbook, sectionId]);

  const persist = useCallback(async (): Promise<boolean> => {
    try {
      await updateSectionCells(sectionId, draftRef.current);
      recalculate();
      return true;
    } catch {
      return false;
    }
  }, [sectionId, updateSectionCells, recalculate]);

  const scheduleSave = useCallback(() => {
    if (!autosave || locked) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void persist();
    }, SAVE_DEBOUNCE_MS);
  }, [autosave, locked, persist]);

  useImperativeHandle(
    ref,
    () => ({
      flush: async () => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        return persist();
      },
    }),
    [persist],
  );

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const fields = SECTION_FIELDS[sectionId] ?? [];

  if (!section) {
    return <p className="text-[13px] text-[var(--esg-text3)]">Unknown section.</p>;
  }

  const updateDraft = (patch: Record<string, string | number | boolean | null>) => {
    setDraft((d) => {
      const next = { ...d, ...patch };
      draftRef.current = next;
      return next;
    });
    scheduleSave();
  };

  return (
    <div className="space-y-4" data-testid={`esg-workbook-section-${sectionId}`}>
      <SectionHeader section={section} title={title} />

      {fields.length === 0 ? (
        <div className="rounded-xl border border-[var(--esg-glass-border)] bg-black/20 p-5 text-[13px] text-[var(--esg-text2)]">
          No scalar fields configured for {section.sheet}.
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--esg-glass-border)] bg-black/20 p-5 grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <label key={f.cell} className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--esg-text3)]">
                {f.label}
              </span>
              {f.type === "select" ? (
                <select
                  value={String(draft[f.cell] ?? "")}
                  disabled={locked}
                  onChange={(e) => updateDraft({ [f.cell]: e.target.value })}
                  onBlur={() => void persist()}
                  className="mt-1 w-full bg-black/30 border border-[var(--esg-glass-border)] rounded-lg px-3 py-2 text-[13px] text-[var(--esg-text)]"
                >
                  <option value="">—</option>
                  {f.options?.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.type === "number" ? "number" : "text"}
                  value={draft[f.cell] ?? ""}
                  disabled={locked}
                  onChange={(e) => {
                    const v =
                      f.type === "number"
                        ? e.target.value === ""
                          ? null
                          : Number(e.target.value)
                        : e.target.value;
                    updateDraft({ [f.cell]: v });
                  }}
                  onBlur={() => void persist()}
                  className="mt-1 w-full bg-black/30 border border-[var(--esg-glass-border)] rounded-lg px-3 py-2 text-[13px] text-[var(--esg-text)]"
                />
              )}
            </label>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void persist()}
          disabled={locked || saving === sectionId}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--esg-acc-e)] text-[#080e14] font-semibold text-[13px] disabled:opacity-50"
          data-testid={`esg-save-${sectionId}`}
        >
          {saving === sectionId ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save section
        </button>
      </div>
    </div>
  );
});

function SectionHeader({ section, title }: { section: EsgSectionDef; title?: string }) {
  return (
    <header>
      <h2 className="text-[18px] font-bold tracking-tight text-[var(--esg-text)]">
        {title ?? section.title}
      </h2>
      <p className="text-[13px] text-[var(--esg-text2)] mt-0.5">
        {section.sheet}
        {section.note ? ` · ${section.note}` : ""}
      </p>
    </header>
  );
}

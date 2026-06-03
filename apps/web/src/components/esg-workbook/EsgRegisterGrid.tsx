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
import {
  esgGridSectionDef,
  type EsgGridSectionId,
} from "@/lib/esgGridSections";
import { mergeEsgSectionCells, readEsgGridRows, type EsgGridRow } from "@/lib/esgGridRows";
import { useEsgStore } from "../../../EsgToolkit/src/lib/esgStore";
import { ESG_PANEL, ESG_PANEL_HEADER, ESG_SAVE_BTN } from "./esgEditorChrome";

const SAVE_DEBOUNCE_MS = 800;

export type EsgRegisterGridHandle = { flush: () => Promise<boolean> };

type Props = {
  sectionId: EsgGridSectionId;
  title?: string;
  autosave?: boolean;
  canAddRows?: boolean;
  canDeleteRows?: boolean;
};

export const EsgRegisterGrid = forwardRef<EsgRegisterGridHandle, Props>(function EsgRegisterGrid(
  { sectionId, title, autosave = true, canAddRows, canDeleteRows },
  ref,
) {
  const def = esgGridSectionDef(sectionId)!;
  const { workbook, submittedAt, saving, updateSectionCells, recalculate, markTouched } =
    useEsgStore();
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

  useImperativeHandle(ref, () => ({
    flush: async () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return persist();
    },
  }));

  const columns = useMemo(() => def.columns, [def]);
  const addRows = canAddRows ?? sectionId !== "iso-tracker";
  const delRows = canDeleteRows ?? sectionId !== "iso-tracker";

  const handleRowsChange = (next: EsgGridRow[]) => {
    setRows(next);
    rowsRef.current = next;
    markTouched(sectionId, "_rows");
    scheduleSave();
  };

  return (
    <div className={ESG_PANEL} data-testid={`esg-register-${sectionId}`}>
      <header className={ESG_PANEL_HEADER}>
        <h2 className="text-[16px] font-bold text-[var(--esg-text)]">{title ?? def.sheet}</h2>
        <p className="text-[12px] text-[var(--esg-text2)] mt-0.5">{def.description}</p>
      </header>
      <div className="p-4 overflow-hidden bg-[var(--esg-input-bg,#0e0e10)]">
        <SpreadsheetGrid
          columns={columns}
          rows={rows}
          onChange={handleRowsChange}
          sectionLabel={def.sheet}
          sectionDescription={def.description}
          readOnly={locked}
          canAddRows={!locked && addRows}
          canDeleteRows={!locked && delRows}
        />
      </div>
      <div className="px-4 pb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void persist()}
          disabled={locked || saving === sectionId}
          className={ESG_SAVE_BTN}
          data-testid={`esg-save-${sectionId}`}
        >
          {saving === sectionId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save section
        </button>
      </div>
    </div>
  );
});

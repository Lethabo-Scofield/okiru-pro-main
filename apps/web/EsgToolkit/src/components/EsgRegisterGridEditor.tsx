import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { SpreadsheetGrid } from "@/components/workbook/SpreadsheetGrid";
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
import { useEsgStore } from "../lib/esgStore";

interface Props {
  sectionId: EsgGridSectionId;
  title?: string;
}

export function EsgRegisterGridEditor({ sectionId, title }: Props) {
  const def = esgGridSectionDef(sectionId)!;
  const { workbook, submittedAt, saving, updateSectionCells, recalculate } = useEsgStore();
  const [rows, setRows] = useState<EsgGridRow[]>([]);
  const locked = Boolean(submittedAt);

  useEffect(() => {
    const cells = workbook?.sections?.[sectionId]?.cells ?? {};
    setRows(readEsgGridRows(cells, sectionId));
  }, [workbook, sectionId]);

  const columns = useMemo(() => def.columns, [def]);

  const save = useCallback(async () => {
    const existing = workbook?.sections?.[sectionId]?.cells ?? {};
    const cells = mergeEsgSectionCells(sectionId, rows, existing);
    await updateSectionCells(sectionId, cells);
    recalculate();
  }, [rows, sectionId, workbook, updateSectionCells, recalculate]);

  if (!isEsgGridSection(sectionId)) {
    return <p className="text-[13px] text-[var(--esg-text3)]">Unknown grid section.</p>;
  }

  return (
    <div className="space-y-4" data-testid={`esg-register-grid-${sectionId}`}>
      <header>
        <h1 className="text-[22px] font-semibold text-[var(--esg-text)]">
          {title ?? def.sheet}
        </h1>
        <p className="text-[12px] text-[var(--esg-text2)] mt-1">{def.description}</p>
        <p className="text-[11px] text-[var(--esg-text3)] mt-1">
          Paste from Excel (Ctrl+V) or edit cells inline. Row layout matches {def.sheet}.
        </p>
      </header>

      <div className="esg-glass overflow-hidden rounded-xl border border-[var(--esg-glass-border)]">
        <SpreadsheetGrid
          columns={columns}
          rows={rows}
          onChange={setRows}
          sectionLabel={def.sheet}
          sectionDescription={def.description}
          readOnly={locked}
          canAddRows={!locked}
          canDeleteRows={!locked}
        />
      </div>

      <button
        type="button"
        onClick={save}
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
  );
}

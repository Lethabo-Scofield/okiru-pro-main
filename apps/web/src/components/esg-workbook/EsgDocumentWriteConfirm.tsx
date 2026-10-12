/**
 * "Add these figures to the workbook?" — asked before documents read from
 * inside a workbook write into it.
 *
 * The documents route used to write straight into an existing workbook on
 * Continue and say so in a toast, so a figure someone had typed by hand could
 * be replaced without anyone being asked. The spreadsheet import already asks,
 * with the same analysis this uses (`analyseEsgImport`): what is added, and
 * what REPLACES a value already there, with both sides of the change. One
 * line says it; the detail is a click away.
 */
import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { analyseEsgImport, type EsgImportAnalysis, type EsgWorkbookLike } from "@/lib/esg/esgImportAnalysis";
import { isEsgAxisCell } from "@/lib/esg/esgCaseAxes";
import { Disclosure } from "@/components/upload/flow/Disclosure";
import { outlineButton, primaryButton } from "@/components/upload/flow/buttonStyles";
import { EsgImportAnalysisPanel } from "./EsgImportAnalysisPanel";

type Cells = Record<string, { cells: Record<string, unknown> }>;

/** A figure, not furniture: register meta (`_rows`) and the sites and months recorded with figures are settings. */
function isFigure(sectionId: string, cell: string): boolean {
  return !cell.startsWith("_") && !(sectionId === "e-data" && isEsgAxisCell(cell));
}

/** What a document write does to the workbook, in figures. */
export function esgWriteCounts(analysis: EsgImportAnalysis): { adds: number; replaces: number; rows: number } {
  return {
    adds: analysis.additions.filter((c) => isFigure(c.sectionId, c.cell)).length,
    replaces: analysis.overwrites.filter((c) => isFigure(c.sectionId, c.cell)).length,
    rows: (analysis.registers ?? []).reduce((n, r) => n + (r.added ?? 0), 0),
  };
}

/** "adds 12 figures · replaces 2 you entered" — the one line the dialog leads with. */
export function describeEsgWrite(counts: { adds: number; replaces: number; rows: number }): string {
  const parts = [
    counts.adds > 0 ? `adds ${counts.adds} figure${counts.adds === 1 ? "" : "s"}` : "",
    counts.rows > 0 ? `adds ${counts.rows} register row${counts.rows === 1 ? "" : "s"}` : "",
    counts.replaces > 0 ? `replaces ${counts.replaces} you entered` : "",
  ].filter(Boolean);
  if (parts.length === 0) return "Changes nothing: the workbook already holds these figures";
  const line = parts.join(" · ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

interface Props {
  open: boolean;
  /** What the read would write — the same shape the import endpoint takes. */
  patches: Cells | null;
  workbook: EsgWorkbookLike | null;
  sectionLabels?: Record<string, string>;
  /** Where the figures go, in words: a section's title, or "your workbook". */
  target: string;
  confirming?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function EsgDocumentWriteConfirm({
  open,
  patches,
  workbook,
  sectionLabels,
  target,
  confirming = false,
  onCancel,
  onConfirm,
}: Props) {
  const analysis = useMemo(
    () => (patches ? analyseEsgImport({ sections: patches, warnings: [], unmatchedSheets: [] }, workbook) : null),
    [patches, workbook],
  );
  if (!open || !analysis) return null;
  const counts = esgWriteCounts(analysis);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--ink)]/70 p-4"
      data-testid="esg-write-confirm"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="esg-write-confirm-title"
        className="w-full max-w-xl rounded-2xl border border-white/[0.08] bg-[color:var(--ink-3)] p-6"
      >
        <h3 id="esg-write-confirm-title" className="text-[16px] font-semibold text-white">
          Add these figures to {target}?
        </h3>
        <p className="mt-1 text-[13px] leading-5 text-[color:var(--body)]" data-testid="esg-write-confirm-summary">
          {describeEsgWrite(counts)}.
        </p>
        {counts.replaces > 0 && (
          <p className="mt-1 text-[12px] leading-5 text-amber-200/90">
            A replaced value is gone from the cell; the document it came from stays in your library.
          </p>
        )}
        <Disclosure summary="What changes, cell by cell" className="mt-3" summaryClassName="text-[12px]" testId="esg-write-confirm-details">
          <div className="max-h-[40vh] overflow-y-auto pr-1">
            <EsgImportAnalysisPanel analysis={analysis} sectionLabels={sectionLabels} />
          </div>
        </Disclosure>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={confirming} className={outlineButton()} data-testid="esg-write-cancel">
            Not yet
          </button>
          <button type="button" onClick={onConfirm} disabled={confirming} className={primaryButton("esg")} data-testid="esg-write-confirm-yes">
            {confirming ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            {confirming
              ? "Adding…"
              : counts.replaces > 0
                ? `Add and replace ${counts.replaces}`
                : "Add to the workbook"}
          </button>
        </div>
      </div>
    </div>
  );
}

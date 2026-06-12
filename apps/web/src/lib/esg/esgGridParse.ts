/**
 * Paste / clipboard parsing for ESG register grids — mirrors workbookGridParse.
 */
import {
  applyPasteToRows,
  expandClipboardMatrix,
  matrixToRowsByPosition,
  parseClipboardMatrix,
  type WorkbookGridRow,
} from "@/lib/workbookGridParse";
import type { EsgColumnDef } from "./esgGridSections";
import type { EsgGridRow } from "./esgGridRows";

export {
  applyPasteToRows,
  expandClipboardMatrix,
  matrixToRowsByPosition,
  parseClipboardMatrix,
};

export function pasteMatrixToEsgRows(
  matrix: string[][],
  columns: EsgColumnDef[],
  existingRows: EsgGridRow[],
  anchor: { row: number; col: number },
  mapHeaders = false,
): EsgGridRow[] {
  return applyPasteToRows(
    existingRows as WorkbookGridRow[],
    columns,
    matrix,
    anchor,
    mapHeaders,
  ) as EsgGridRow[];
}

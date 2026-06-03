import type { EsgWorkbookData } from "./esgWorkbookStorage";
import { readEsgCell } from "./esgWorkbookStorage";

export type EsgAutofillPatch = {
  sectionId: string;
  cells: Record<string, string | number | boolean | null>;
  message: string;
};

export function suggestEsgAutofillPatches(workbook: EsgWorkbookData | null): EsgAutofillPatch[] {
  if (!workbook) return [];
  const patches: EsgAutofillPatch[] = [];

  const sector = readEsgCell(workbook, "cover", "sector") ?? readEsgCell(workbook, "assumptions", "B8");
  const assumptionsSector = readEsgCell(workbook, "assumptions", "B8");
  if (sector && !assumptionsSector) {
    patches.push({
      sectionId: "assumptions",
      cells: { B8: String(sector) },
      message: "Apply sector from Cover to Assumptions?",
    });
  }

  const payroll = readEsgCell(workbook, "s-data", "B70");
  const sdl = readEsgCell(workbook, "s-data", "B71");
  if (payroll != null && Number(payroll) > 0 && (sdl == null || sdl === "" || sdl === 0)) {
    patches.push({
      sectionId: "s-data",
      cells: { B71: Number(payroll) * 0.01 },
      message: "Auto-fill SDL from payroll (1%)?",
    });
  }

  return patches;
}

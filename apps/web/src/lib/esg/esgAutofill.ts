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

  // Sector is Assumptions!B10 ("Sector", code SECTOR), not B8 — B8 is the scoring stance.
  const sector =
    readEsgCell(workbook, "company-reporting-setup", "sector") ??
    readEsgCell(workbook, "cover", "sector") ??
    readEsgCell(workbook, "assumptions", "B10");
  const assumptionsSector = readEsgCell(workbook, "assumptions", "B10");
  if (sector && !assumptionsSector) {
    patches.push({
      sectionId: "assumptions",
      cells: { B10: String(sector) },
      message: "Apply sector from Cover to Assumptions?",
    });
  }

  // Leviable payroll is S_Data!B43 and the SDL levy is S_Data!B44 (=IFERROR(B43*0.01,0)).
  // This previously read B70 (blank) and wrote B71, which is the Community table's
  // "Month" column header. Once B44 is derived this suggestion simply stops firing.
  const payroll = readEsgCell(workbook, "s-data", "B43");
  const sdl = readEsgCell(workbook, "s-data", "B44");
  if (payroll != null && Number(payroll) > 0 && (sdl == null || sdl === "" || sdl === 0)) {
    patches.push({
      sectionId: "s-data",
      cells: { B44: Number(payroll) * 0.01 },
      message: "Auto-fill SDL from payroll (1%)?",
    });
  }

  return patches;
}

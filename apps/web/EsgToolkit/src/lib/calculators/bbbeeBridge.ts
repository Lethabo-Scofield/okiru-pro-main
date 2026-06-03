import { readEsgCell, type EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { stanceFloor } from "./shared";

/** B_BBEE_ESG bridge — EE_Scorecard E15 + Assumptions B9 floor. */
export type BbbeeBridgeResult = {
  eeScorecardPoints: number;
  stanceFloor: number;
  ownershipPartialCredit: number;
  skillsPartialCredit: number;
  sedPartialCredit: number;
};

export function computeBbbeeBridge(workbook: EsgWorkbookData): BbbeeBridgeResult {
  const eePts = readEsgCell(workbook, "ee", "E15") ?? readEsgCell(workbook, "ee", "D15") ?? 0;
  const floor = readEsgCell(workbook, "assumptions", "B9") ?? stanceFloor("standard");
  const factor = floor;
  return {
    eeScorecardPoints: eePts,
    stanceFloor: floor,
    ownershipPartialCredit: eePts * factor * 0.1,
    skillsPartialCredit: eePts * factor * 0.1,
    sedPartialCredit: eePts * factor * 0.05,
  };
}

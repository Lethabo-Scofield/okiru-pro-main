import { readEsgCell, type EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { PILLAR_MAX_GOVERNANCE } from "../esgConfig/consumer-goods";
import { minCap } from "./shared";

export type GovernanceScoreResult = {
  score: number;
  max: number;
  rows: Record<string, number>;
};

function fCell(wb: EsgWorkbookData, ref: string): number {
  return readEsgCell(wb, "g-data", ref) ?? 0;
}

export function scoreGovernance(workbook: EsgWorkbookData): GovernanceScoreResult {
  const king5 = readEsgCell(workbook, "king5", "E21") ?? 0;
  const d5 = minCap((king5 / 170) * 25, 25);
  const d6 = minCap(fCell(workbook, "F13"), 5);
  const d7 = minCap(fCell(workbook, "F14"), 5);

  const yesCount = readEsgCell(workbook, "ifrs", "_yes_count") ?? 0;
  const ifrsTotal = readEsgCell(workbook, "ifrs", "_total") ?? 10;
  const d9 = minCap(10 * (yesCount / Math.max(1, ifrsTotal)), 10);

  const d10 = minCap(fCell(workbook, "F23"), 5);

  const f21 = fCell(workbook, "F21");
  const f23 = fCell(workbook, "F23");
  const d12 = f21 > 0 && f23 > 0 ? 8 : f21 > 0 ? 4 : 0;

  const d14 = fCell(workbook, "F5") > 0 ? 5 : 0;
  const d16 = minCap(fCell(workbook, "F17"), 5);
  const d17 = minCap(fCell(workbook, "F18"), 5);
  const d19 = minCap((fCell(workbook, "F20") * 8) / 5, 8);
  const d20 = minCap(fCell(workbook, "F19"), 5);
  const d22 = minCap(((fCell(workbook, "F15") + fCell(workbook, "F16")) / 2) * (4 / 5), 4);
  const d24 = minCap(fCell(workbook, "F21"), 5);

  const penalties = workbook.sections?.["g-data"]?.cells?.["B25"];
  const d25 =
    penalties === "" || penalties == null || penalties === 0 ? 5 : 0;

  const rows = { d5, d6, d7, d9, d10, d12, d14, d16, d17, d19, d20, d22, d24, d25 };
  const score = Object.values(rows).reduce((a, b) => a + b, 0);
  return { score: minCap(score, PILLAR_MAX_GOVERNANCE), max: PILLAR_MAX_GOVERNANCE, rows };
}

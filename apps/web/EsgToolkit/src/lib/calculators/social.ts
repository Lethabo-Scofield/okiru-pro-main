import { readEsgCell, type EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import {
  PILLAR_MAX_SOCIAL,
  THR_BLACK_EE,
  THR_CSI_INITIATIVES,
  THR_LEVY_SPEND,
  THR_LTIFR,
  THR_PWD,
  THR_TRAINING_HOURS,
} from "../esgConfig/consumer-goods";
import { minCap, pr, prLtifr, yesPartialNo } from "./shared";

export type SocialScoreResult = {
  score: number;
  max: number;
  rows: Record<string, number>;
};

function num(wb: EsgWorkbookData, ref: string, section = "s-data"): number {
  return readEsgCell(wb, section, ref) ?? 0;
}

function str(wb: EsgWorkbookData, ref: string, section: string): string {
  const v = wb.sections?.[section]?.cells?.[ref];
  return v == null ? "" : String(v);
}

export function scoreSocial(workbook: EsgWorkbookData): SocialScoreResult {
  const floor = readEsgCell(workbook, "assumptions", "B9") ?? 0.5;
  const thrLtifr = readEsgCell(workbook, "assumptions", "B55") ?? THR_LTIFR;

  const blackPct = readEsgCell(workbook, "ee", "B5") ?? 0;
  const thrBlack = readEsgCell(workbook, "assumptions", "B50") ?? THR_BLACK_EE;
  const d5 = pr(blackPct, thrBlack, 8, floor);

  const d6 = 0;
  const d7 = yesPartialNo(str(workbook, "B9", "ee"), 5);
  const pwd = readEsgCell(workbook, "ee", "B8") ?? 0;
  const d8 = pr(pwd, readEsgCell(workbook, "assumptions", "B52") ?? THR_PWD, 5, floor);
  const d9 = yesPartialNo(str(workbook, "B10", "ee"), 3);
  const d10 = yesPartialNo(str(workbook, "B12", "ee"), 3);

  const d12 = str(workbook, "B45", "s-data").toLowerCase() === "yes" ? 5 : 0;
  const d13 = str(workbook, "B46", "s-data").toLowerCase() === "yes" ? 5 : 0;
  const headcount = num(workbook, "L12");
  const d14 = headcount > 0
    ? pr(num(workbook, "B49") / headcount, readEsgCell(workbook, "assumptions", "B53") ?? THR_TRAINING_HOURS, 5, floor)
    : 0;
  const levy = num(workbook, "B44");
  const d15 =
    levy > 0
      ? pr(num(workbook, "B47") / levy, readEsgCell(workbook, "assumptions", "B54") ?? THR_LEVY_SPEND, 5, floor)
      : 0;

  const ltifr = readEsgCell(workbook, "s-data", "G35");
  const d17 = prLtifr(ltifr, thrLtifr, 8, floor);

  const g28 = workbook.sections?.["s-data"]?.cells?.["G28"];
  const fatalitiesOk =
    g28 === 0 || g28 === "—" || g28 === "" || g28 == null;
  const d18 = fatalitiesOk ? 8 : 0;

  const driverActive =
    (readEsgCell(workbook, "driver-debrief", "_active") ?? 0) > 0 || num(workbook, "C59") > 0;
  const d19 = driverActive ? 5 : 0;
  const d20 = num(workbook, "G29") > 0 ? 4 : 0;

  const initiatives = readEsgCell(workbook, "s-data", "_initiatives_count") ?? THR_CSI_INITIATIVES;
  const d23 =
    initiatives >= THR_CSI_INITIATIVES
      ? 5
      : pr(initiatives, THR_CSI_INITIATIVES, 5, floor);

  const d22 = 0;
  const d24 = 0;
  const d26 = 0;
  const d27 = 0;

  const rows = { d5, d6, d7, d8, d9, d10, d12, d13, d14, d15, d17, d18, d19, d20, d22, d23, d24, d26, d27 };
  const score = Object.values(rows).reduce((a, b) => a + b, 0);
  return { score: minCap(score, PILLAR_MAX_SOCIAL), max: PILLAR_MAX_SOCIAL, rows };
}

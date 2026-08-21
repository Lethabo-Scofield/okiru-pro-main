/**
 * `S_Scorecard` rows 5–27 — Social pillar.
 *
 * Ledger: `docs/esg/ESG_FORMULA_LEDGER.md` Part 1B. Divergences from the client
 * workbook are catalogued in `docs/esg/ESG_SCORING_DELTA.md`.
 */
import { readEsgCell, type EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import {
  ESG_CONSUMER_GOODS_CONFIG,
  PILLAR_MAX_SOCIAL,
  THR_BLACK_EE,
  THR_CSI_INITIATIVES,
  THR_LEVY_SPEND,
  THR_LTIFR,
  THR_PWD,
  THR_TRAINING_HOURS,
} from "../esgConfig/consumer-goods";
import {
  minCap,
  pr,
  prLtifr,
  scoringMode,
  yesPartialNo,
  type EsgScoringOptions,
} from "./shared";

export type SocialScoreResult = {
  score: number;
  max: number;
  rows: Record<string, number>;
};

const THRESHOLDS = ESG_CONSUMER_GOODS_CONFIG.thresholds;

/**
 * `S_Data!F5,F6,G5,G6,H5,H6` — African / Coloured / Indian FEMALE headcount at
 * EEA2 levels 1 (Top Mgmt) and 2 (Senior Mgmt). Note the indicator label says
 * "L1-L3" but the workbook formula covers rows 5 and 6 only; reproduced as-is,
 * because widening it is a scoring decision rather than a defect fix.
 */
const BLACK_FEMALE_MGMT_CELLS = ["F5", "F6", "G5", "G6", "H5", "H6"] as const;
/** `S_Data!L5,L6` — total headcount at the same two levels. */
const MGMT_HEADCOUNT_CELLS = ["L5", "L6"] as const;
/** `S_Data!G29:G33` — LTI / MTI / near-miss / vehicle / property incident totals. */
const INCIDENT_ROWS = ["G29", "G30", "G31", "G32", "G33"] as const;

function num(wb: EsgWorkbookData, ref: string, section = "s-data"): number {
  return readEsgCell(wb, section, ref) ?? 0;
}

function str(wb: EsgWorkbookData, ref: string, section: string): string {
  const v = wb.sections?.[section]?.cells?.[ref];
  return v == null ? "" : String(v);
}

export function scoreSocial(
  workbook: EsgWorkbookData,
  options?: EsgScoringOptions,
): SocialScoreResult {
  const mode = scoringMode(options);

  const floor = readEsgCell(workbook, "assumptions", "B9") ?? 0.5;
  const thrBlack = readEsgCell(workbook, "assumptions", "B50") ?? THR_BLACK_EE;
  const thrBfm =
    readEsgCell(workbook, "assumptions", "B51") ?? THRESHOLDS.blackFemaleManagement;
  const thrPwd = readEsgCell(workbook, "assumptions", "B52") ?? THR_PWD;
  const thrTraining = readEsgCell(workbook, "assumptions", "B53") ?? THR_TRAINING_HOURS;
  const thrGrant = readEsgCell(workbook, "assumptions", "B54") ?? THR_LEVY_SPEND;
  const thrLtifr = readEsgCell(workbook, "assumptions", "B55") ?? THR_LTIFR;
  const thrCsiSpend = readEsgCell(workbook, "assumptions", "B56") ?? THRESHOLDS.csiSpendOfNpat;
  const thrLocal =
    readEsgCell(workbook, "assumptions", "B57") ?? THRESHOLDS.localLabourProcurement;

  /* -------------------------- Employment Equity -------------------- */

  // C5 = =IFERROR(IF(EE!B5>=B50,8,IF(EE!B5>=B50*B9,8*EE!B5/B50,0)),0)
  // `EE_Scorecard!B5` is now derived from the S_Data headcount matrix
  // (`=(B5+C5+D5+F5+G5+H5)/L5`) instead of being hand-typed.
  const d5 = pr(readEsgCell(workbook, "ee", "B5") ?? 0, thrBlack, 8, floor);

  /*
   * C6 = =IFERROR(IF((L5+L6)=0,0,
   *        IF((F5+F6+G5+G6+H5+H6)/(L5+L6)>=B51,6,
   *        IF((F5+F6+G5+G6+H5+H6)/(L5+L6)>=B51*B9,
   *           6*((F5+F6+G5+G6+H5+H6)/(L5+L6))/B51,0))),0)
   *
   * The headcount matrix now rolls up into `S_Data!B5:L12`, so this is
   * computable instead of hardcoded to 0.
   */
  const blackFemaleMgmt = BLACK_FEMALE_MGMT_CELLS.reduce((a, ref) => a + num(workbook, ref), 0);
  const mgmtHeadcount = MGMT_HEADCOUNT_CELLS.reduce((a, ref) => a + num(workbook, ref), 0);
  const d6 = mgmtHeadcount > 0 ? pr(blackFemaleMgmt / mgmtHeadcount, thrBfm, 6, floor) : 0;

  // C7 = =IF(EE!B9="Yes",5,IF(EE!B9="Partial",2.5,0))
  const d7 = yesPartialNo(str(workbook, "B9", "ee"), 5);
  // C8 = =IFERROR(IF(EE!B8>=B52,5,IF(EE!B8>=B52*B9,5*EE!B8/B52,0)),0)
  const d8 = pr(readEsgCell(workbook, "ee", "B8") ?? 0, thrPwd, 5, floor);
  // C9 = =IF(EE!B10="Yes",3,IF(EE!B10="Partial",1.5,0))
  const d9 = yesPartialNo(str(workbook, "B10", "ee"), 3);
  // C10 = =IF(EE!B12="Yes",3,IF(EE!B12="Partial",1.5,0))
  const d10 = yesPartialNo(str(workbook, "B12", "ee"), 3);

  /* ------------------------------- WSP ----------------------------- */

  // C12 = =IF(S_Data!B45="Yes",5,0) — no Partial branch in the workbook.
  const d12 = str(workbook, "B45", "s-data").trim().toLowerCase() === "yes" ? 5 : 0;
  // C13 = =IF(S_Data!B46="Yes",5,0)
  const d13 = str(workbook, "B46", "s-data").trim().toLowerCase() === "yes" ? 5 : 0;

  // C14 = =IFERROR(IF(L12=0,0,IF(B49/L12>=B53,5,IF(B49/L12>=B53*B9,5*(B49/L12)/B53,0))),0)
  const headcount = num(workbook, "L12");
  const d14 = headcount > 0 ? pr(num(workbook, "B49") / headcount, thrTraining, 5, floor) : 0;

  // C15 = =IFERROR(IF(B44=0,0,IF(B47/B44>=B54,5,IF(B47/B44>=B54*B9,5*(B47/B44)/B54,0))),0)
  // `B44` is the SDL levy (`=B43*0.01`), now DERIVED-ONLY so a mislabelled
  // "NPAT" input can no longer corrupt this denominator.
  const levy = num(workbook, "B44");
  const d15 = levy > 0 ? pr(num(workbook, "B47") / levy, thrGrant, 5, floor) : 0;

  /* ---------------------------- Health & Safety -------------------- */

  // C17 = =IFERROR(IF(G35=0,0,IF(G35<=B55,8,
  //         IF(G35<=B55/B9,MAX(0,8*(1+B9-G35/B55)),0))),0)
  // `S_Data!G35` is derived from hours worked and LTIs
  // (`=SUM(C29:F29)*1000000/SUM(C27:F27)`); absent hours leave it non-numeric,
  // which reads as null and scores 0.
  const d17 = prLtifr(readEsgCell(workbook, "s-data", "G35"), thrLtifr, 8, floor);

  /*
   * C18 = =IFERROR(IF(OR(G28=0,G28="—",G28=""),8,0),0)
   *
   * CORRECTED (unconditional score removed). The workbook awards the full 8
   * points for "Zero fatalities" when `S_Data!G28` is 0, an em-dash, or BLANK —
   * so an empty workbook, which has never reported anything, collects them. The
   * em-dash is the template author's own placeholder, not an attestation.
   *
   * Corrected rule: the company must actually report a fatality count. `G28` is
   * derived as `=SUM(C28:F28)` over the four quarterly cells, so entering
   * 0/0/0/0 — an explicit "no fatalities this year" — scores 8, and reporting
   * one loses them. Nothing entered scores 0.
   */
  const g28 = workbook.sections?.["s-data"]?.cells?.["G28"];
  const d18 =
    mode === "workbook-parity"
      ? g28 === 0 || g28 === "—" || g28 === "" || g28 == null
        ? 8
        : 0
      : readEsgCell(workbook, "s-data", "G28") === 0
        ? 8
        : 0;

  /*
   * C19 = =IF(S_Data!$C$59>0,5,0) — OFO learners on the fatigue programme.
   *
   * INTENTIONAL SUPERSET (kept): a filled Driver_Debrief register also counts.
   * `driver-debrief!_active` is a real derived cell — `esgGridRows.ts` sets it
   * to 1 only when the register has rows with a driver or date — so this is
   * evidence, not a default.
   */
  const driverActive =
    (readEsgCell(workbook, "driver-debrief", "_active") ?? 0) > 0 || num(workbook, "C59") > 0;
  const d19 = driverActive ? 5 : 0;

  /*
   * C20 = =IF(SUM(S_Data!$G$29:$G$33)>0,4,0)
   *
   * CORRECTED (wrong cells). This read `G29` alone, so a company recording only
   * MTIs, near-misses, vehicle or property incidents scored 0 for having an
   * investigation process.
   */
  const incidents = INCIDENT_ROWS.reduce((a, ref) => a + num(workbook, ref), 0);
  const d20 = incidents > 0 ? 4 : 0;

  /* ---------------------------- Community -------------------------- */

  /*
   * C22 — MANUAL_ZERO in the workbook: CSI/SED spend ≥1% NPAT needed an NPAT
   * figure the template never carried. `S_Data!B84` ("Net profit after tax (R)")
   * now exists as an input and `S_Data!D82 = =SUM(D72:D81)` (total CSI spend) is
   * derived from the CSI register, so ledger 5.2's rule is live:
   *
   *   IF(B84<=0,0,IF(D82/B84>=B56,5,IF(D82/B84>=B56*B9,5*(D82/B84)/B56,0)))
   *
   * NOTE the denominator is `B84`, NOT `B44` — `B44` is the derived SDL levy,
   * which `S_DATA_PAYROLL_FIELDS` used to mislabel "NPAT (R)".
   */
  const npat = num(workbook, "B84");
  const csiSpend = num(workbook, "D82");
  const d22 =
    mode === "workbook-parity" || npat <= 0 ? 0 : pr(csiSpend / npat, thrCsiSpend, 5, floor);

  /*
   * C23 = =IFERROR(IF(COUNTA(A72:A79)>=6,5,
   *         IF(COUNTA(A72:A79)>=6*B9,5*COUNTA(A72:A79)/6,0)),0)
   * The threshold 6 is hardcoded in the workbook — there is no Assumptions cell.
   */
  const initiatives = readEsgCell(workbook, "s-data", "_initiatives_count") ?? 0;
  const d23 = pr(initiatives, THR_CSI_INITIATIVES, 5, floor);

  /*
   * C24 — MANUAL_ZERO in the workbook. `S_Data!B86` (local procurement spend)
   * and `B87` (total measured procurement spend) now exist as inputs, so ledger
   * 5.2's rule is live against `THR_LOCAL` (`Assumptions!B57`):
   *
   *   IF(B87=0,0,IF(B86/B87>=B57,5,IF(B86/B87>=B57*B9,5*(B86/B87)/B57,0)))
   */
  const procurementTotal = num(workbook, "B87");
  const procurementLocal = num(workbook, "B86");
  const d24 =
    mode === "workbook-parity" || procurementTotal <= 0
      ? 0
      : pr(procurementLocal / procurementTotal, thrLocal, 5, floor);

  /* ---------------------------- Suppliers -------------------------- */

  // C26 / C27 — MANUAL_ZERO: SAQ_Supplier aggregates are not derived (ledger 5.2).
  const d26 = 0;
  const d27 = 0;

  const rows = {
    d5, d6, d7, d8, d9, d10, d12, d13, d14, d15,
    d17, d18, d19, d20, d22, d23, d24, d26, d27,
  };
  const score = Object.values(rows).reduce((a, b) => a + b, 0);
  return { score: minCap(score, PILLAR_MAX_SOCIAL), max: PILLAR_MAX_SOCIAL, rows };
}

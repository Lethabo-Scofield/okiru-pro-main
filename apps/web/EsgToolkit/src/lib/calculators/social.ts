import { ESG_D9_PILLAR_DIVISOR } from "@/lib/esgScoringDefaults";
/**
 * `S_Scorecard` rows 5–27 — Social pillar.
 *
 * Ledger: `docs/esg/ESG_FORMULA_LEDGER.md` Part 1B. Divergences from the client
 * workbook are catalogued in `docs/esg/ESG_SCORING_DELTA.md`.
 */
import { readEsgCell, type EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { PILLAR_MAX_SOCIAL } from "../esgConfig/consumer-goods";
import { esgSectorConfigForWorkbook } from "../esgConfig";
import {
  minCap,
  pr,
  prLtifr,
  scoringMode,
  yesPartialNo,
  type EsgScoringOptions,
} from "./shared";
import {
  applicableMaxFor,
  exclude,
  mergeExclusions,
  readDeclaredExclusions,
  type EsgPillarResult,
} from "./esgApplicability";
import {
  readTargetBasis,
  resolveTarget,
  targetNotSetReason,
  TARGET_BASIS_REASON,
} from "./esgTargets";
import type { EsgExclusion } from "./esgApplicability";
import {
  answerRule,
  bandedRule,
  cell as traceCell,
  inverseBandedRule,
  targetSource,
  type EsgTraceUnit,
} from "./esgTrace";

export type SocialScoreResult = EsgPillarResult;

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

/**
 * The workbook's band, guarded for a target the company has not set.
 *
 * A null target is not a target of zero — it means the indicator cannot be
 * scored at all, and it is excluded from the denominator elsewhere. This only
 * keeps the arithmetic from running against a target that is not there.
 */
function prT(actual: number, target: number | null, max: number, floor: number): number {
  return target == null ? 0 : pr(actual, target, max, floor);
}

export function scoreSocial(
  workbook: EsgWorkbookData,
  options?: EsgScoringOptions,
): SocialScoreResult {
  const mode = scoringMode(options);

  const floor = readEsgCell(workbook, "assumptions", "B9") ?? 0.5;

  /*
   * Targets are the company's, not ours. ESG frameworks do not prescribe them,
   * so each of these resolves to `null` unless the company has declared a basis
   * — its own numbers, the B-BBEE/EE targets, or trend-only. An indicator with
   * no target cannot be scored against one, so it leaves the total with the
   * reason stated rather than being graded against a number we invented.
   *
   * Parity mode keeps the workbook's own constants, because reproducing that
   * spreadsheet is what it is for.
   */
  const basis = mode === "workbook-parity" ? "bbbee" : readTargetBasis(workbook);
  const targetExclusions: EsgExclusion[] = [];
  const target = (key: string, cell: string, bbbeeDefault: number, label: string): number | null => {
    const resolved = resolveTarget(workbook, cell, bbbeeDefault, basis);
    if (resolved == null) {
      const reason =
        basis === "own"
          ? targetNotSetReason(label)
          : TARGET_BASIS_REASON[basis as "undeclared" | "trend"];
      const x = exclude("social", key, reason);
      if (x) targetExclusions.push(x);
    }
    return resolved;
  };

  const thresholds = esgSectorConfigForWorkbook(workbook).thresholds;
  const thrBlack = target("d5", "B50", thresholds.blackEmployees, "black employee representation");
  const thrBfm = target("d6", "B51", thresholds.blackFemaleManagement, "black women in management");
  const thrPwd = target("d8", "B52", thresholds.personsWithDisabilities, "employees with disabilities");
  const thrTraining = target("d14", "B53", thresholds.trainingHoursPerEmployee, "training hours per employee");
  const thrGrant = target("d15", "B54", thresholds.mandatoryGrantRecovery, "mandatory grant recovery");
  const thrLtifr = target("d17", "B55", thresholds.ltifrMax, "lost-time injury frequency rate");
  const thrCsiSpend = target("d22", "B56", thresholds.csiSpendOfNpat, "community investment");
  const thrLocal = target("d24", "B57", thresholds.localLabourProcurement, "local procurement");

  /* -------------------------- Employment Equity -------------------- */

  // C5 = =IFERROR(IF(EE!B5>=B50,8,IF(EE!B5>=B50*B9,8*EE!B5/B50,0)),0)
  // `EE_Scorecard!B5` is now derived from the S_Data headcount matrix
  // (`=(B5+C5+D5+F5+G5+H5)/L5`) instead of being hand-typed.
  const d5 = prT(readEsgCell(workbook, "ee", "B5") ?? 0, thrBlack, 8, floor);

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
  const d6 = mgmtHeadcount > 0 ? prT(blackFemaleMgmt / mgmtHeadcount, thrBfm, 6, floor) : 0;

  // C7 = =IF(EE!B9="Yes",5,IF(EE!B9="Partial",2.5,0))
  const d7 = yesPartialNo(str(workbook, "B9", "ee"), 5);
  // C8 = =IFERROR(IF(EE!B8>=B52,5,IF(EE!B8>=B52*B9,5*EE!B8/B52,0)),0)
  const d8 = prT(readEsgCell(workbook, "ee", "B8") ?? 0, thrPwd, 5, floor);
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
  const d14 = headcount > 0 ? prT(num(workbook, "B49") / headcount, thrTraining, 5, floor) : 0;

  // C15 = =IFERROR(IF(B44=0,0,IF(B47/B44>=B54,5,IF(B47/B44>=B54*B9,5*(B47/B44)/B54,0))),0)
  // `B44` is the SDL levy (`=B43*0.01`), now DERIVED-ONLY so a mislabelled
  // "NPAT" input can no longer corrupt this denominator.
  const levy = num(workbook, "B44");
  const d15 = levy > 0 ? prT(num(workbook, "B47") / levy, thrGrant, 5, floor) : 0;

  /* ---------------------------- Health & Safety -------------------- */

  // C17 = =IFERROR(IF(G35=0,0,IF(G35<=B55,8,
  //         IF(G35<=B55/B9,MAX(0,8*(1+B9-G35/B55)),0))),0)
  // `S_Data!G35` is derived from hours worked and LTIs
  // (`=SUM(C29:F29)*1000000/SUM(C27:F27)`); absent hours leave it non-numeric,
  // which reads as null and scores 0.
  const d17 = thrLtifr == null ? 0 : prLtifr(readEsgCell(workbook, "s-data", "G35"), thrLtifr, 8, floor);

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
  /*
   * A company with no incidents and a company that does not track incidents
   * look identical in a spreadsheet, and this indicator was scoring them the
   * same: zero. Asked about it, the expert turned the question back on us —
   * "No incidents because they are a company that does not report on health and
   * safety, or because they are required to and have been a model company and
   * have had no issues?" (Q14) — which is exactly the distinction the data
   * could not make.
   *
   * So the company says which it is. A clean year with the process in place is
   * full marks; not tracking at all is zero; and an undeclared blank is neither
   * scored nor charged — it leaves the total until somebody answers.
   */
  const incidents = INCIDENT_ROWS.reduce((a, ref) => a + num(workbook, ref), 0);
  const hsTracking = str(workbook, "_hsTracking", "s-data").trim().toLowerCase();
  const tracksIncidents = hsTracking.startsWith("yes");
  const declaredNoTracking = hsTracking.startsWith("no");

  let d20: number;
  if (incidents > 0) {
    d20 = 4; // Incidents recorded, so the register is demonstrably in use.
  } else if (tracksIncidents) {
    d20 = 4; // A declared clean year against a live register.
  } else {
    d20 = 0; // Not tracked, or not yet declared.
  }
  if (mode !== "workbook-parity" && incidents === 0 && !tracksIncidents && !declaredNoTracking) {
    const x = exclude(
      "social",
      "d20",
      "No health-and-safety incidents are recorded and the company has not said whether it tracks them. A clean year and an untracked year are different facts, and this indicator cannot tell them apart until one is declared.",
    );
    if (x) targetExclusions.push(x);
  }

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
    mode === "workbook-parity" || npat <= 0 ? 0 : prT(csiSpend / npat, thrCsiSpend, 5, floor);

  /*
   * C23 = =IFERROR(IF(COUNTA(A72:A79)>=6,5,
   *         IF(COUNTA(A72:A79)>=6*B9,5*COUNTA(A72:A79)/6,0)),0)
   * The threshold 6 is hardcoded in the workbook — there is no Assumptions cell.
   */
  const initiatives = readEsgCell(workbook, "s-data", "_initiatives_count") ?? 0;
  /*
   * That hardcoded 6 was the last target here nobody had set: every other
   * Social target already followed the declared basis. It now does too — the
   * company's own figure (`Assumptions!_csiInitiativesTarget`), or the row
   * leaves the total with its reason. A B-BBEE election does not supply one:
   * B-BBEE measures community investment as spend (d22), never as a count.
   * Parity mode keeps the workbook's 6.
   */
  const thrInitiatives =
    mode === "workbook-parity"
      ? thresholds.csiInitiativesPerYear
      : resolveTarget(
          workbook,
          "_csiInitiativesTarget",
          thresholds.csiInitiativesPerYear,
          basis === "bbbee" ? "own" : basis,
        );
  if (mode !== "workbook-parity" && thrInitiatives == null) {
    const x = exclude(
      "social",
      "d23",
      basis === "own"
        ? targetNotSetReason("community initiatives a year")
        : basis === "bbbee"
          ? "B-BBEE measures community investment as spend, not as a count of initiatives, and the company has not set one for community initiatives a year, so there is nothing to score against. The figure is still reported."
          : TARGET_BASIS_REASON[basis as "undeclared" | "trend"],
    );
    if (x) targetExclusions.push(x);
  }
  const d23 = thrInitiatives == null ? 0 : pr(initiatives, thrInitiatives, 5, floor);

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
      : prT(procurementLocal / procurementTotal, thrLocal, 5, floor);

  /* ---------------------------- Suppliers -------------------------- */

  /*
   * C26 / C27 — MANUAL_ZERO in the workbook, and until now zero here too, so
   * the supplier register was the third input the product collected and never
   * read: twelve suppliers rated across seven criteria, ten points, and no
   * path from one to the other.
   *
   * The ratings already land on the cells ledger §5.2 names — `healthSafety`
   * is column D and `foodSafety` column F — so all that was missing were the
   * means, which `esgDeriveSummary.deriveSaqSupplier` now publishes with `N/A`
   * excluded (Excel's own `AVERAGE` behaviour over a text cell).
   *
   * An empty register publishes no mean, so `supplierCount === 0` scores zero
   * rather than a free pass — the explicit warning the ledger leaves for
   * whoever wired this up.
   *
   * Both share `THR_SUP_HS` (`Assumptions!B58`) until a dedicated food-safety
   * threshold exists, and both go through `target()`, so the expert ruling
   * that ESG has no universal targets applies here as everywhere else: with no
   * declared basis the indicator leaves the total with its reason stated,
   * rather than being graded against a number we invented.
   */
  const thrSupplier = target(
    "d26",
    "B58",
    thresholds.supplierHsCompliance,
    "supplier health, safety and food-safety compliance",
  );
  const supplierCount = readEsgCell(workbook, "saq", "_supplier_count") ?? 0;
  const supplierRatingMax = readEsgCell(workbook, "saq", "_max_rating") ?? 5;
  /*
   * COVERAGE. Assessing three of four hundred suppliers and rating them 5/5
   * is not the same result as assessing all four hundred, and until
   * `S_Data!B89` existed the register could not tell those apart — so it
   * rewarded assessing your best supplier and stopping.
   *
   * `null` means the population was never declared, and that is NOT read as
   * full coverage: the indicator keeps its pre-coverage behaviour so no
   * stored workbook is re-scored downward, and the validation panel asks for
   * the figure instead.
   */
  const supplierCoverage = readEsgCell(workbook, "saq", "_coverage");
  const supplierBand = (meanRef: string, maxPts: number): number => {
    if (mode === "workbook-parity" || supplierCount <= 0 || supplierRatingMax <= 0) return 0;
    const mean = readEsgCell(workbook, "saq", meanRef);
    if (mean == null) return 0;
    const earned = prT(mean / supplierRatingMax, thrSupplier, maxPts, floor);
    return supplierCoverage == null ? earned : earned * supplierCoverage;
  };

  const d26 = supplierBand("_hs_mean", 5);
  const d27 = supplierBand("_fs_mean", 5);

  /* ----------------------- How each row was made (E2) ---------------------- */
  // Observes the values above; computes nothing the score depends on.
  const trace = options?.trace;
  if (trace) {
    const parity = mode === "workbook-parity";
    const PARITY_ZERO = "Workbook-parity scoring: the client workbook holds a literal 0 in this row.";
    const traceTarget = (ref: string, value: number | null, unit: EsgTraceUnit) => {
      if (value == null) return null;
      const stated = readEsgCell(workbook, "assumptions", ref) != null;
      const source = parity
        ? stated
          ? targetSource("workbook", `Assumptions!${ref}`)
          : targetSource("workbook-default")
        : basis === "bbbee"
          ? stated
            ? targetSource("bbbee-stated", `Assumptions!${ref}`)
            : targetSource("bbbee-default")
          : targetSource("company", `Assumptions!${ref}`);
      return { value, unit, source };
    };
    const answer = (sheet: string, ref: string, section: string, label: string) => {
      const value = str(workbook, ref, section);
      return {
        measured: value ? { value, unit: "answer" as const, label } : null,
        inputs: [traceCell(sheet, ref, label, value || null)],
      };
    };
    const record = trace.record.bind(trace);
    const blackShare = readEsgCell(workbook, "ee", "B5");
    const pwdShare = readEsgCell(workbook, "ee", "B8");

    record({
      key: "d5",
      measured: blackShare == null ? null : { value: blackShare, unit: "ratio", label: "Black employees, share of headcount" },
      target: traceTarget("B50", thrBlack, "ratio"),
      inputs: [traceCell("EE_Scorecard", "B5", "Black employees (share of headcount), from the S_Data headcount matrix", blackShare)],
      rule: bandedRule(8, floor, "the black share of the workforce"),
    });
    record({
      key: "d6",
      measured: mgmtHeadcount > 0 ? { value: blackFemaleMgmt / mgmtHeadcount, unit: "ratio", label: "Black women in top and senior management" } : null,
      target: traceTarget("B51", thrBfm, "ratio"),
      inputs: [
        traceCell("S_Data", "F5:H6", "Black women in top and senior management", blackFemaleMgmt),
        traceCell("S_Data", "L5:L6", "Top and senior management headcount", mgmtHeadcount),
      ],
      rule: bandedRule(6, floor, "the share of black women in management"),
    });
    record({ key: "d7", target: null, rule: answerRule(5, "An Employment Equity plan submitted"), ...answer("EE_Scorecard", "B9", "ee", "Employment Equity plan submitted") });
    record({
      key: "d8",
      measured: pwdShare == null ? null : { value: pwdShare, unit: "ratio", label: "Employees with disabilities, share of headcount" },
      target: traceTarget("B52", thrPwd, "ratio"),
      inputs: [traceCell("EE_Scorecard", "B8", "Employees with disabilities (share of headcount)", pwdShare)],
      rule: bandedRule(5, floor, "the share of employees with disabilities"),
    });
    record({ key: "d9", target: null, rule: answerRule(3, "The Employment Equity forum consulted"), ...answer("EE_Scorecard", "B10", "ee", "Employment Equity forum consulted") });
    record({ key: "d10", target: null, rule: answerRule(3, "Numerical targets set per level, race and gender"), ...answer("EE_Scorecard", "B12", "ee", "Numerical EE targets set") });
    record({ key: "d12", target: null, rule: "5 points when the Workplace Skills Plan is submitted (Yes); nothing otherwise — the workbook has no Partial here.", ...answer("S_Data", "B45", "s-data", "Workplace Skills Plan submitted") });
    record({ key: "d13", target: null, rule: "5 points when the Annual Training Report is submitted (Yes); nothing otherwise.", ...answer("S_Data", "B46", "s-data", "Annual Training Report submitted") });
    record({
      key: "d14",
      measured: headcount > 0 ? { value: num(workbook, "B49") / headcount, unit: "hours", label: "Training hours per employee" } : null,
      target: traceTarget("B53", thrTraining, "hours"),
      inputs: [traceCell("S_Data", "B49", "Total training hours delivered", num(workbook, "B49")), traceCell("S_Data", "L12", "Total headcount", headcount)],
      rule: bandedRule(5, floor, "training hours per employee"),
    });
    record({
      key: "d15",
      measured: levy > 0 ? { value: num(workbook, "B47") / levy, unit: "ratio", label: "Mandatory grant recovered, share of the skills levy" } : null,
      target: traceTarget("B54", thrGrant, "ratio"),
      inputs: [traceCell("S_Data", "B47", "Mandatory grant claimed (R)", num(workbook, "B47")), traceCell("S_Data", "B44", "Skills development levy (R), derived", levy)],
      rule: bandedRule(5, floor, "the grant recovered"),
    });
    record({
      key: "d17",
      measured: readEsgCell(workbook, "s-data", "G35") == null ? null : { value: readEsgCell(workbook, "s-data", "G35"), unit: "rate", label: "Lost-time injury frequency rate (per 1,000,000 hours)" },
      target: traceTarget("B55", thrLtifr, "rate"),
      inputs: [traceCell("S_Data", "G35", "LTIFR, from lost-time injuries and hours worked", readEsgCell(workbook, "s-data", "G35"))],
      rule: inverseBandedRule(8, floor, "the injury rate"),
    });
    record({
      key: "d18",
      measured: { value: parity ? (g28 == null ? null : String(g28)) : readEsgCell(workbook, "s-data", "G28"), unit: "count", label: "Fatalities reported this period" },
      target: null,
      inputs: [traceCell("S_Data", "G28", "Fatalities (sum of the four quarters)", g28)],
      rule: parity
        ? "Workbook-parity scoring: 8 points when the cell is 0, a dash or blank — the workbook's own rule."
        : "8 points when the company reports zero fatalities for the period; nothing when it reports one or reports nothing.",
    });
    record({
      key: "d19",
      measured: { value: driverActive, unit: "answer", label: "Driver fatigue programme in place" },
      target: null,
      inputs: [
        traceCell("Driver_Debrief", "rows", "Driver debrief register in use", readEsgCell(workbook, "driver-debrief", "_active") ?? 0),
        traceCell("S_Data", "C59", "OFO learners on the fatigue programme", num(workbook, "C59")),
      ],
      rule: "5 points when the driver debrief register is in use or learners are on the fatigue programme; nothing otherwise.",
    });
    record({
      key: "d20",
      measured: { value: incidents, unit: "count", label: "Health and safety incidents recorded" },
      target: null,
      inputs: [
        traceCell("S_Data", "G29:G33", "Incidents recorded (injuries, near-misses, vehicle and property)", incidents),
        traceCell("S_Data", "_hsTracking", "Does the company track incidents?", hsTracking || null),
      ],
      rule: "4 points when incidents are recorded, or when the company declares it tracks them and had a clean year; nothing when it does not track them. With neither, the row waits for the company to say which.",
    });
    record({
      key: "d22",
      measured: !parity && npat > 0 ? { value: csiSpend / npat, unit: "ratio", label: "Community investment, share of net profit after tax" } : null,
      target: traceTarget("B56", thrCsiSpend, "ratio"),
      inputs: [traceCell("S_Data", "D82", "Community investment spend (R), from the CSI register", csiSpend), traceCell("S_Data", "B84", "Net profit after tax (R)", npat)],
      rule: parity ? PARITY_ZERO : bandedRule(5, floor, "community investment as a share of profit"),
    });
    record({
      key: "d23",
      measured: { value: initiatives, unit: "count", label: "Community initiatives this period" },
      target:
        thrInitiatives == null
          ? null
          : {
              value: thrInitiatives,
              unit: "count",
              source: parity ? targetSource("workbook-default") : targetSource("company", "Assumptions!_csiInitiativesTarget"),
            },
      inputs: [traceCell("S_Data", "A72:A79", "Community initiatives in the CSI register", initiatives)],
      rule: bandedRule(5, floor, "the number of community initiatives"),
    });
    record({
      key: "d24",
      measured: !parity && procurementTotal > 0 ? { value: procurementLocal / procurementTotal, unit: "ratio", label: "Local procurement, share of measured spend" } : null,
      target: traceTarget("B57", thrLocal, "ratio"),
      inputs: [traceCell("S_Data", "B86", "Local procurement spend (R)", procurementLocal), traceCell("S_Data", "B87", "Total measured procurement spend (R)", procurementTotal)],
      rule: parity ? PARITY_ZERO : bandedRule(5, floor, "the local share of procurement"),
    });
    for (const [key, meanRef, what] of [
      ["d26", "_hs_mean", "health and safety"],
      ["d27", "_fs_mean", "food safety"],
    ] as const) {
      const mean = readEsgCell(workbook, "saq", meanRef);
      record({
        key,
        measured: !parity && mean != null && supplierRatingMax > 0 ? { value: mean / supplierRatingMax, unit: "ratio", label: `Suppliers' ${what} rating, as a share of the top rating` } : null,
        target: traceTarget("B58", thrSupplier, "ratio"),
        inputs: [
          traceCell("SAQ_Supplier", meanRef === "_hs_mean" ? "D:D" : "F:F", `Mean supplier ${what} rating`, mean),
          traceCell("SAQ_Supplier", "rows", "Suppliers assessed", supplierCount),
          traceCell("S_Data", "B89", "Assessed share of the supplier population (blank = not declared)", supplierCoverage),
        ],
        rule: parity
          ? PARITY_ZERO
          : `${bandedRule(5, floor, `the mean ${what} rating`)} Scaled by the share of suppliers assessed once the company declares how many it has.`,
      });
    }
  }

  const rows = {
    d5, d6, d7, d8, d9, d10, d12, d13, d14, d15,
    d17, d18, d19, d20, d22, d23, d24, d26, d27,
  };
  const score = Object.values(rows).reduce((a, b) => a + b, 0);

  /*
   * Exclusions leave the numerator and the denominator together. Parity mode
   * takes none: it reproduces the client's spreadsheet, which has no concept of
   * an indicator that does not apply.
   */
  /*
   * Mandatory grant recovery is not an ESG measure. Asked what it was doing in
   * an ESG scorecard, the expert's answer was "I do not understand this
   * question and how it links to ESG" (Q5) — it is a Skills Development
   * mechanic borrowed from B-BBEE. It is excluded from the total rather than
   * deleted, so the points come out of the denominator and the reason is on
   * the report instead of the indicator quietly disappearing.
   */
  const notEsgExclusions =
    mode === "workbook-parity"
      ? []
      : [
          exclude(
            "social",
            "d15",
            "Not an ESG measure. Mandatory grant recovery is a Skills Development mechanic under B-BBEE and does not belong in an ESG score.",
          ),
        ];

  const excluded =
    mode === "workbook-parity"
      ? []
      : mergeExclusions(
          readDeclaredExclusions(workbook, "social"),
          // The first reason for a key is the one stated, so the permanent one
          // goes before the resolvable: declaring a target basis does not bring
          // mandatory grant recovery back into an ESG score.
          notEsgExclusions,
          targetExclusions,
        );
  const scored = Object.entries(rows)
    .filter(([key]) => !excluded.some((x) => x.key === key))
    .reduce((a, [, v]) => a + v, 0);
  const scoringDenominator =
    mode === "workbook-parity"
      ? ESG_D9_PILLAR_DIVISOR
      : applicableMaxFor(ESG_D9_PILLAR_DIVISOR, excluded);

  return {
    score: minCap(mode === "workbook-parity" ? score : scored, PILLAR_MAX_SOCIAL),
    max: PILLAR_MAX_SOCIAL,
    scoringDenominator,
    rows,
    excluded,
  };
}

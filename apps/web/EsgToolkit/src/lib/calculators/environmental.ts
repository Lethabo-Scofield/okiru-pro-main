import { ESG_D9_PILLAR_DIVISOR } from "@/lib/esgScoringDefaults";
/**
 * `E_Scorecard` rows 5–29 — Environmental pillar.
 *
 * Ledger: `docs/esg/ESG_FORMULA_LEDGER.md` Part 1A. Every indicator below cites
 * the workbook's own column-C formula. Divergences are listed in
 * `docs/esg/ESG_SCORING_DELTA.md`.
 *
 * The summary cells read here (`E_Data!L19/L46/L50:L54/L63/L80/L81`,
 * `Waste_Register!B16:B18`, `Fleet_Register!B28/H28/_l100_*`) are produced by
 * `apps/web/src/lib/esg/esgDeriveSummary.ts` from the raw input grids — that is
 * the app's stand-in for the workbook's formula layer. Nothing here re-derives
 * them.
 */
import { readEsgCell, type EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import {
  ESG_CONSUMER_GOODS_CONFIG,
  PILLAR_MAX_ENVIRONMENTAL,
  THR_GHG_YOY,
  THR_WASTE,
  stanceFloorFromWorkbook,
} from "../esgConfig/consumer-goods";
import { minCap, pr, scoringMode, yesPartialNo, type EsgScoringOptions } from "./shared";
import {
  applicableMaxFor,
  exclude,
  mergeExclusions,
  readDeclaredExclusions,
  type EsgPillarResult,
} from "./esgApplicability";

export type EnvironmentalScoreResult = EsgPillarResult;

const THRESHOLDS = ESG_CONSUMER_GOODS_CONFIG.thresholds;

/** `E_Data!L50:L54` — the five depot solar-generation YTD cells. */
const SOLAR_ROWS = ["L50", "L51", "L52", "L53", "L54"] as const;

function num(wb: EsgWorkbookData, ref: string, section = "e-data"): number {
  return readEsgCell(wb, section, ref) ?? 0;
}

export function scoreEnvironmental(
  workbook: EsgWorkbookData,
  options?: EsgScoringOptions,
): EnvironmentalScoreResult {
  const mode = scoringMode(options);

  // `Assumptions!B9` is DERIVED-ONLY and always numeric after
  // `deriveEsgSummaryCells`; `B6` is the legacy address the current form still
  // writes the stance label to (ledger Part 3).
  const stanceLabel = workbook.sections?.assumptions?.cells?.B6;
  const floor = stanceFloorFromWorkbook(
    typeof stanceLabel === "boolean" ? null : stanceLabel,
    readEsgCell(workbook, "assumptions", "B9"),
  );
  const thrGhgYoy = readEsgCell(workbook, "assumptions", "B43") ?? THR_GHG_YOY;
  const thrRenew =
    readEsgCell(workbook, "assumptions", "B44") ?? THRESHOLDS.renewableElectricityMin;
  const thrEv = readEsgCell(workbook, "assumptions", "B46") ?? THRESHOLDS.evFleetMin;
  const thrWaste = readEsgCell(workbook, "assumptions", "B48") ?? THR_WASTE;

  const l19 = num(workbook, "L19");
  const l46 = num(workbook, "L46");
  const l63 = num(workbook, "L63");
  const b90 = num(workbook, "B90");
  const f90 = num(workbook, "F90");

  /* ------------------------------- GHG ------------------------------ */

  // C5 = =IF(E_Data!L19>0,5,0)
  const d5 = l19 > 0 ? 5 : 0;

  // C6 = =IFERROR(IF(B90=0,0,IF((B90-F90)/B90>=B43,10,
  //        IF((B90-F90)/B90>=B43*B9,10*((B90-F90)/B90)/B43,0))),0)
  const d6 = b90 > 0 ? pr((b90 - f90) / b90, thrGhgYoy, 10, floor) : 0;

  /*
   * C7 = =IFERROR(IF(M80=0,0,IF(-M81/M80>=B44,8,
   *        IF(-M81/M80>=B44*B9,8*(-M81/M80)/B44,0))),0)
   *
   * CORRECTED. `E_Data!M80`/`M81` do not exist — rows 80 and 81 stop at column
   * L — so the workbook's Scope-2 solar-offset indicator is 0 for every company
   * forever. The cells the formula means are `L80` (Scope 2 gross, `=L46`) and
   * `L81` (solar offset, `=SUM(L50:L54)`), and the leading minus is dropped
   * because `L81` is a POSITIVE kWh sum, not a negative adjustment.
   */
  const s2Gross = mode === "workbook-parity" ? num(workbook, "M80") : num(workbook, "L80");
  const s2Offset =
    mode === "workbook-parity" ? -num(workbook, "M81") : num(workbook, "L81");
  const d7 = s2Gross > 0 ? pr(s2Offset / s2Gross, thrRenew, 8, floor) : 0;

  // C8 = =IF(E_Data!$L$63>0,5,0)
  const d8 = l63 > 0 ? 5 : 0;

  /*
   * C9 = =IF(AND(B107>=2030,B107<=2060),5,IF(B107>0,2.5,0))
   *
   * CORRECTED (unconditional score removed). `B107` used to fall back to the
   * config's `SBTI_TARGET_YEAR` (2050), so a workbook with no net-zero target
   * set — including a completely blank one — collected the full 5 points for
   * "Net-zero target formally set (SBTi)". A target the company never entered
   * is not a target.
   */
  const sbtiYear = readEsgCell(workbook, "assumptions", "B107") ?? 0;
  const d9 = sbtiYear >= 2030 && sbtiYear <= 2060 ? 5 : sbtiYear > 0 ? 2.5 : 0;

  /* ------------------------------ Energy ---------------------------- */

  // C11 = =IF(E_Data!L46>0,5,0)
  const d11 = l46 > 0 ? 5 : 0;

  /*
   * C12 — MANUAL_ZERO in the workbook (literal 0, no formula) because energy
   * efficiency YoY needs a prior-year kWh baseline the template never had.
   * `E_Data!B92` ("Prior-year total electricity (kWh)") now exists as an input,
   * so ledger 5.1's rule is live — it mirrors `d6` exactly, reusing
   * `THR_GHG_YOY` (B43) and the stance floor:
   *
   *   IF(B92=0,0,IF((B92-L46)/B92>=B43,5,
   *     IF((B92-L46)/B92>=B43*B9,5*((B92-L46)/B92)/B43,0)))
   */
  const priorYearKwh = num(workbook, "B92");
  const d12 =
    mode === "workbook-parity" || priorYearKwh <= 0
      ? 0
      : pr((priorYearKwh - l46) / priorYearKwh, thrGhgYoy, 5, floor);

  /*
   * C13 = =IFERROR(IF(L46=0,0,IF((L50+L51+L52+L53+L54)/L46>=B44,8,
   *         IF((L50+…+L54)/L46>=B44*B9,8*((L50+…+L54)/L46)/B44,0))),0)
   */
  const solarKwh = SOLAR_ROWS.reduce((a, ref) => a + num(workbook, ref), 0);
  const d13 = l46 > 0 ? pr(solarKwh / l46, thrRenew, 8, floor) : 0;

  /* ------------------------------- Fleet ---------------------------- */

  /*
   * C15 = =IFERROR(IF(COUNTA(Fleet_Register!A4:A19)=0,0,
   *         8*SUMPRODUCT((K4:K19>0)*(K4:K19<=L4:L19*B45))
   *           / MAX(1,COUNTIF(K4:K19,">0"))),0)
   *
   * The SUMPRODUCT / COUNTA / COUNTIF terms are pre-computed by
   * `esgDeriveSummary.deriveFleetRegister` (which also applies the `B45`
   * tolerance) and published as `_vehicle_count` / `_l100_within_norm` /
   * `_l100_positive`.
   */
  const vehicleCount = num(workbook, "_vehicle_count", "fleet");
  const l100WithinNorm = num(workbook, "_l100_within_norm", "fleet");
  const l100Positive = num(workbook, "_l100_positive", "fleet");
  const d15 =
    vehicleCount > 0 ? minCap((8 * l100WithinNorm) / Math.max(1, l100Positive), 8) : 0;

  // C16 = =IF(SUMPRODUCT((F4:F19>0)*(I4:I19>0))>0,5,0) — carry kg AND monthly km.
  const d16 = num(workbook, "_tonne_km_rows", "fleet") > 0 ? 5 : 0;

  /*
   * C17 = =IFERROR(IF(B28=0,0,IF(H28/B28>=B46,5,
   *         IF(H28/B28>=B46*B9,5*(H28/B28)/B46,0))),0)
   *
   * `B28`/`H28` are stored as TEXT ("134"/"0") in the source workbook;
   * `readEsgCell` number-coerces, so both shapes work.
   */
  const fleetVehicles = num(workbook, "B28", "fleet");
  const fleetEvs = num(workbook, "H28", "fleet");
  const d17 = fleetVehicles > 0 ? pr(fleetEvs / fleetVehicles, thrEv, 5, floor) : 0;

  /* ------------------------------- Waste ---------------------------- */

  // C19 = =IFERROR(IF(B16>=B48,5,IF(B16>=B48*B9,5*B16/B48,0)),0)
  const d19 = pr(num(workbook, "B16", "waste"), thrWaste, 5, floor);
  // C20 = =IF(Waste_Register!$B$17>0,4,0)
  const d20 = num(workbook, "B17", "waste") > 0 ? 4 : 0;
  // C21 = =IF(Waste_Register!$B$18>0,3,0)
  const d21 = num(workbook, "B18", "waste") > 0 ? 3 : 0;

  /* ------------------------------- Water ---------------------------- */

  // C23 = =IF(E_Data!L63>0,4,0)
  const d23 = l63 > 0 ? 4 : 0;

  /*
   * C24 — MANUAL_ZERO in the workbook. `E_Data!B94` ("Water efficiency
   * initiative active", Yes/No/Partial/N-A) now exists as an input, so ledger
   * 5.1's rule is live: IF(B94="Yes",3,IF(B94="Partial",1.5,0)).
   */
  const d24 =
    mode === "workbook-parity"
      ? 0
      : yesPartialNo(workbook.sections?.["e-data"]?.cells?.["B94"], 3);

  /* ----------------------- ISO 14001 / policy ----------------------- */

  /*
   * C26–C29 — MANUAL_ZERO in the workbook (four literal `0`s, no formulas),
   * and until now zero here too. That is twenty of the Environmental pillar's
   * 108 points which no company could reach however well it performed — while
   * the product still asked every one of them to complete a sixty-row ISO
   * clause tracker and a board-policy declaration in order to earn them.
   * Collecting evidence and then scoring it zero is worse than not asking.
   *
   * `esgDeriveSummary.deriveIsoTracker` now publishes the terms ledger §5.1's
   * rules need, matched by CLAUSE rather than by sheet row, with
   * "Not Applicable" excluded rather than handed full marks. Every rule below
   * reads 0 out of an empty register, so a blank workbook still earns nothing.
   *
   * Parity mode keeps the workbook's literal zeros, exactly as `d12` and `d24`
   * do, so `ESG_GOLDEN_SG_CONSUMER` is unaffected.
   */
  const parity = mode === "workbook-parity";
  const isoCert = num(workbook, "_cert_score", "iso-tracker");
  const isoAspects = num(workbook, "_aspects_score", "iso-tracker");
  const isoPolicy = num(workbook, "_policy_score", "iso-tracker");
  const isoLegal = num(workbook, "_legal_score", "iso-tracker");
  const emsScore = num(workbook, "_ems_score", "iso-tracker");
  const emsMax = num(workbook, "_ems_max", "iso-tracker");

  /*
   * C26 = MIN(8, 4*ISO_Tracker!E16/5 + 4*ISO_Tracker!E17/60)
   * Half the points for the certificate itself, half for EMS maturity.
   */
  const d26 = parity
    ? 0
    : minCap((4 * isoCert) / 5 + (emsMax > 0 ? (4 * emsScore) / emsMax : 0), 8);

  // C27 = 4*ISO_Tracker!E10/5 — the environmental aspects register.
  const d27 = parity ? 0 : minCap((4 * isoAspects) / 5, 4);

  /*
   * C28 = MIN(G_Data!F27, ISO_Tracker!E8) * 4/5 — the STRICTER of the board's
   * own declaration and the ISO clause-5.2 assessment. A policy the board
   * approved but the audit calls partial is partial.
   */
  const policyDeclared = num(workbook, "F27", "g-data");
  const d28 = parity ? 0 : minCap((Math.min(policyDeclared, isoPolicy) * 4) / 5, 4);

  /*
   * C29 = IF(G_Data!F21=0, 0, 4*ISO_Tracker!E11/5) — a legal register counts
   * only where the governance risk register it belongs to is live.
   */
  const legalRegisterLive = num(workbook, "F21", "g-data") > 0;
  const d29 = parity || !legalRegisterLive ? 0 : minCap((4 * isoLegal) / 5, 4);

  const rows = {
    d5, d6, d7, d8, d9, d11, d12, d13, d15, d16, d17,
    d19, d20, d21, d23, d24, d26, d27, d28, d29,
  };
  const score = Object.values(rows).reduce((a, b) => a + b, 0);

  /*
   * Exclusions leave the numerator and the denominator together. Parity mode
   * takes none: it reproduces the client's spreadsheet, which has no concept of
   * an indicator that does not apply.
   */
  const excluded =
    mode === "workbook-parity"
      ? []
      : mergeExclusions(readDeclaredExclusions(workbook, "environmental"), []);
  const scored = Object.entries(rows)
    .filter(([key]) => !excluded.some((x) => x.key === key))
    .reduce((a, [, v]) => a + v, 0);
  /*
   * A pillar is scored out of what it can actually reach — 108 here, not 100.
   *
   * `ESG_D9_PILLAR_DIVISOR` is a flat 100 because that is literally what the
   * workbook's `ESG_Dashboard!D9` divides every pillar by, Environmental
   * included, even though the E scorecard adds up to 108. The workbook got
   * away with it: `d26`–`d29` were MANUAL_ZERO, so only 88 points were ever
   * reachable and the ratio stayed under 1.
   *
   * Wiring those four indicators removed the accident. Against a divisor of
   * 100 a company scoring the full 108 now reads 108%, and one scoring 90
   * reads 90% when it has earned 83% of what was available — the arithmetic
   * flatters every environmental result and breaks at the top.
   *
   * Parity keeps the flat 100, because reproducing that spreadsheet is what it
   * is for and `ESG_GOLDEN_SG_CONSUMER.overallPercent` is avg(36/100, 33/100,
   * 64.85/100).
   */
  const scoringDenominator =
    mode === "workbook-parity"
      ? ESG_D9_PILLAR_DIVISOR
      : applicableMaxFor(PILLAR_MAX_ENVIRONMENTAL, excluded);

  return {
    score: minCap(mode === "workbook-parity" ? score : scored, PILLAR_MAX_ENVIRONMENTAL),
    max: PILLAR_MAX_ENVIRONMENTAL,
    scoringDenominator,
    rows,
    excluded,
  };
}

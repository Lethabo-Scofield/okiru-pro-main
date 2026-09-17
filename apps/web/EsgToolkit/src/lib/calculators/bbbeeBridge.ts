/**
 * `B_BBEE_ESG` — the one-way bridge from ESG inputs to the B-BBEE Generic
 * Scorecard (Codes of Good Practice, Statement 000 series).
 *
 * WHAT CHANGED AND WHY
 * --------------------
 * This module used to return three "partial credits" computed as
 * `EE_Scorecard!E15 × Assumptions!B9 × {0.1, 0.1, 0.05}`. Those coefficients
 * appear nowhere in the workbook, in `docs/esg/`, or in the Codes — they were
 * inline literals with no source. Worse, the multiplicand was read from
 * `ee!E15` **or** `ee!D15`, neither of which anything wrote, so all three
 * credits were always 0 and the page rendered a column of zeros that looked
 * like real, earned results.
 *
 * The workbook does not need invented coefficients, because it already carries
 * the real element formulas (`docs/esg/extracted/B_BBEE_ESG.json`, rows 6–11):
 *
 *   Ownership          B6=25  E6 = IF(D6>=0.251,25,IF(D6>=0.251*B9,25*D6/0.251,0))
 *   Management Control B7=19  D7 = EE_Scorecard!E15/100        E7 = D7*19
 *   Skills Development B8=25  D8 = S_Data!B50/MAX(1,S_Data!B43)
 *                             E8 = IF(D8>=0.06,25,IF(D8>=0.06*B9,25*D8/0.06,0))
 *   Enterprise & Supplier Dev  B9=40  E9 = D9*40
 *   Socio-Economic Dev B10=5  E10 = IF(D10>=B56,5,IF(D10>=B56*B9,5*D10/B56,0))
 *   Bonus points       B11=5  E11 = MIN(5,D11)
 *   E12 = SUM(E6:E11)   B12 = SUM(B6:B11) = 119
 *
 * Only two of the six have inputs in this app: Management Control (from the
 * derived `EE_Scorecard!E15`) and Skills Development (training spend ÷ leviable
 * payroll). The other four are hand-entered `D` cells on a sheet the app has no
 * editor for, so they are reported as **not available** rather than as 0 —
 * a company with no ownership data has not scored 0 on ownership, it has not
 * measured it.
 */
import { readEsgCell, type EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { ESG_CONSUMER_GOODS_CONFIG } from "../esgConfig/consumer-goods";
import { pr, stanceFloor } from "./shared";

/** `Assumptions!B68:B72` + `B_BBEE_ESG!B11` — Generic Scorecard element weights. */
export const BBBEE_ELEMENT_WEIGHTS = {
  ownership: 25,
  managementControl: 19,
  skillsDevelopment: 25,
  enterpriseSupplierDevelopment: 40,
  socioEconomicDevelopment: 5,
  bonus: 5,
} as const;

/** `B_BBEE_ESG!C6` — Statement 100 sub-target, 25.1 % Black ownership. */
const OWNERSHIP_TARGET = 0.251;
/** `B_BBEE_ESG!C8` — Statement 300 sub-target, 6 % of payroll on Black training. */
const SKILLS_PAYROLL_TARGET = 0.06;

export type BbbeeElementId =
  | "ownership"
  | "managementControl"
  | "skillsDevelopment"
  | "enterpriseSupplierDevelopment"
  | "socioEconomicDevelopment"
  | "bonus";

export type BbbeeElement = {
  id: BbbeeElementId;
  label: string;
  /** Statement weighting (max points). */
  weight: number;
  /** Points earned, or `null` when the element has no measurable input. */
  points: number | null;
  /** The measured ratio behind `points` (`B_BBEE_ESG` column D), if any. */
  actual: number | null;
  /** False when nothing in the app can supply this element's input. */
  available: boolean;
  /** Why an element is unavailable — rendered instead of a fake 0. */
  note?: string;
};

export type BbbeeBridgeResult = {
  /** `EE_Scorecard!E15` — the EE sheet's own 0–100 score. */
  eeScorecardPoints: number;
  /** `Assumptions!B9`. */
  stanceFloor: number;
  elements: BbbeeElement[];
  /** Σ points over the measurable elements only (`B_BBEE_ESG!E12`, partial). */
  totalPoints: number;
  /** Σ weights over the measurable elements — the honest denominator. */
  measuredWeight: number;
  /** Σ of all element weights (`B_BBEE_ESG!B12` = 119). */
  totalWeight: number;
  /** True when at least one element could be measured. */
  available: boolean;
  /** `B_BBEE_ESG!B15`, or `null` when the level ladder is incomplete. */
  statusLevel: string | null;
  /** Why `statusLevel` is null. */
  statusLevelNote?: string;
};

/**
 * `Assumptions!B76:B84` — the B-BBEE status-level ladder.
 * **`B79` (Level 4) and `B81` (Level 6) are BLANK in the source workbook**, so
 * `B_BBEE_ESG!B15` compares against 0 and reports "Level 4" for ANY score,
 * including zero. We do not back-fill them: the Generic Codes' real values are
 * a business decision, not something to infer here.
 */
const LEVEL_LADDER: ReadonlyArray<{ cell: string; label: string }> = [
  { cell: "B76", label: "Level 1" },
  { cell: "B77", label: "Level 2" },
  { cell: "B78", label: "Level 3" },
  { cell: "B79", label: "Level 4" },
  { cell: "B80", label: "Level 5" },
  { cell: "B81", label: "Level 6" },
  { cell: "B82", label: "Level 7" },
  { cell: "B83", label: "Level 8" },
];

export function computeBbbeeBridge(workbook: EsgWorkbookData): BbbeeBridgeResult {
  const floor = readEsgCell(workbook, "assumptions", "B9") ?? stanceFloor("standard");
  const thrCsi =
    readEsgCell(workbook, "assumptions", "B56") ??
    ESG_CONSUMER_GOODS_CONFIG.thresholds.csiSpendOfNpat;

  // `EE_Scorecard!E15 = =SUM(E5:E14)` — derived by esgDeriveSummary from the
  // headcount matrix and the EE maturity answers. (`D15` is a label column on
  // the sheet and was never a fallback for it.)
  const eePts = readEsgCell(workbook, "ee", "E15") ?? 0;
  const hasEe = readEsgCell(workbook, "ee", "E15") != null;

  /** Manual `B_BBEE_ESG` column-D entries — only present on an imported sheet. */
  const manual = (ref: string): number | null => readEsgCell(workbook, "bbbee", ref);

  const elements: BbbeeElement[] = [];

  // Ownership — D6 is hand-entered against the share register; no app input.
  const ownershipActual = manual("D6");
  elements.push({
    id: "ownership",
    label: "Ownership (Statement 100)",
    weight: BBBEE_ELEMENT_WEIGHTS.ownership,
    actual: ownershipActual,
    points:
      ownershipActual == null
        ? null
        : pr(ownershipActual, OWNERSHIP_TARGET, BBBEE_ELEMENT_WEIGHTS.ownership, floor),
    available: ownershipActual != null,
    note:
      ownershipActual == null
        ? "Needs verified Black ownership % (share register / modified flow-through). No input in this app."
        : undefined,
  });

  // Management Control — D7 = EE_Scorecard!E15/100, E7 = D7*19.
  const mcActual = hasEe ? eePts / 100 : null;
  elements.push({
    id: "managementControl",
    label: "Management Control (Statement 200)",
    weight: BBBEE_ELEMENT_WEIGHTS.managementControl,
    actual: mcActual,
    points: mcActual == null ? null : mcActual * BBBEE_ELEMENT_WEIGHTS.managementControl,
    available: mcActual != null,
    note: mcActual == null ? "Needs the EE scorecard (headcount matrix + EE plan answers)." : undefined,
  });

  // Skills Development — D8 = S_Data!B50 / MAX(1, S_Data!B43).
  const trainingSpend = readEsgCell(workbook, "s-data", "B50");
  const leviablePayroll = readEsgCell(workbook, "s-data", "B43");
  const sdAvailable = trainingSpend != null && leviablePayroll != null && leviablePayroll > 0;
  const sdActual = sdAvailable ? (trainingSpend as number) / Math.max(1, leviablePayroll as number) : null;
  elements.push({
    id: "skillsDevelopment",
    label: "Skills Development (Statement 300)",
    weight: BBBEE_ELEMENT_WEIGHTS.skillsDevelopment,
    actual: sdActual,
    points:
      sdActual == null
        ? null
        : pr(sdActual, SKILLS_PAYROLL_TARGET, BBBEE_ELEMENT_WEIGHTS.skillsDevelopment, floor),
    available: sdActual != null,
    note: sdActual == null ? "Needs training spend (S_Data B50) and leviable payroll (S_Data B43)." : undefined,
  });

  // Enterprise & Supplier Development — D9 hand-entered; no app input.
  const esdActual = manual("D9");
  elements.push({
    id: "enterpriseSupplierDevelopment",
    label: "Enterprise & Supplier Development (Statement 400)",
    weight: BBBEE_ELEMENT_WEIGHTS.enterpriseSupplierDevelopment,
    actual: esdActual,
    points:
      esdActual == null
        ? null
        : Math.min(
            BBBEE_ELEMENT_WEIGHTS.enterpriseSupplierDevelopment,
            esdActual * BBBEE_ELEMENT_WEIGHTS.enterpriseSupplierDevelopment,
          ),
    available: esdActual != null,
    note: esdActual == null ? "Needs PP 25 + ESD 15 recognition %. No input in this app." : undefined,
  });

  /*
   * Socio-Economic Development — D10 = CSI spend ÷ NPAT. `S_Data!D82` (CSI
   * spend) IS derived from the CSI register, but NPAT has no cell anywhere in
   * the workbook (ledger 5.2 proposes a new `S_Data!B84`), so the ratio cannot
   * be formed. An imported `B_BBEE_ESG!D10` is used when present.
   */
  const csiSpend = readEsgCell(workbook, "s-data", "D82");
  const npat = readEsgCell(workbook, "s-data", "B84");
  const sedActual =
    manual("D10") ?? (csiSpend != null && npat != null && npat > 0 ? csiSpend / npat : null);
  elements.push({
    id: "socioEconomicDevelopment",
    label: "Socio-Economic Development (Statement 500)",
    weight: BBBEE_ELEMENT_WEIGHTS.socioEconomicDevelopment,
    actual: sedActual,
    points:
      sedActual == null
        ? null
        : pr(sedActual, thrCsi, BBBEE_ELEMENT_WEIGHTS.socioEconomicDevelopment, floor),
    available: sedActual != null,
    note: sedActual == null ? "Needs NPAT — no NPAT cell exists in the workbook (see ledger 5.2)." : undefined,
  });

  // Bonus points — E11 = MIN(5, D11), hand-claimed.
  const bonusActual = manual("D11");
  elements.push({
    id: "bonus",
    label: "Bonus points (net job creation, value-adding)",
    weight: BBBEE_ELEMENT_WEIGHTS.bonus,
    actual: bonusActual,
    points: bonusActual == null ? null : Math.min(BBBEE_ELEMENT_WEIGHTS.bonus, bonusActual),
    available: bonusActual != null,
    note: bonusActual == null ? "Hand-claimed on the B_BBEE_ESG sheet. No input in this app." : undefined,
  });

  const measured = elements.filter((e) => e.available);
  const totalPoints = measured.reduce((a, e) => a + (e.points ?? 0), 0);
  const measuredWeight = measured.reduce((a, e) => a + e.weight, 0);
  const totalWeight = Object.values(BBBEE_ELEMENT_WEIGHTS).reduce((a, b) => a + b, 0);

  const level = resolveStatusLevel(workbook, totalPoints, measured.length === elements.length);

  return {
    eeScorecardPoints: eePts,
    stanceFloor: floor,
    elements,
    totalPoints,
    measuredWeight,
    totalWeight,
    available: measured.length > 0,
    statusLevel: level.label,
    statusLevelNote: level.note,
  };
}

/**
 * `B_BBEE_ESG!B15` — the status-level ladder. Returns `null` unless every rung
 * is present AND every element was measured: a level computed from a partial
 * scorecard, or from a ladder with holes in it, is a fabricated verification
 * result. The source workbook does exactly that and reports "Level 4" for a
 * score of 6.65 out of 119.
 */
function resolveStatusLevel(
  workbook: EsgWorkbookData,
  totalPoints: number,
  allElementsMeasured: boolean,
): { label: string | null; note?: string } {
  const rungs = LEVEL_LADDER.map((r) => ({
    ...r,
    threshold: readEsgCell(workbook, "assumptions", r.cell),
  }));
  const missing = rungs.filter((r) => r.threshold == null);
  if (missing.length > 0) {
    return {
      label: null,
      note: `B-BBEE level not determined — the status-level ladder is incomplete (${missing
        .map((m) => `Assumptions!${m.cell} (${m.label})`)
        .join(", ")} blank). Thresholds are not inferred.`,
    };
  }
  if (!allElementsMeasured) {
    return {
      label: null,
      note: "B-BBEE level not determined — not every Generic Scorecard element could be measured from the ESG inputs.",
    };
  }
  for (const rung of rungs) {
    if (totalPoints >= (rung.threshold as number)) return { label: rung.label };
  }
  return { label: "Non-compliant" };
}

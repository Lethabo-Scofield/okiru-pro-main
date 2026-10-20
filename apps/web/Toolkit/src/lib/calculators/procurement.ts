import type { ProcurementData, Supplier } from '../types';
import type { CalculatorConfig } from '../../../../shared/schema';
import { safeRatio, clampScore, round2, requireSectorConfig, resolveSectorContext, supplierSumTmps } from './shared';
import { parseCalcDate, yearFracActual360 } from './toolkitDates';
import { formatPct, formatRand, ratioLineNote } from './calcNotes';

/**
 * @domain-rule pillar:procurement, slides:56,57
 * @see docs/domain/pillars/04_preferential_procurement.md#procurement-recognition-levels
 * @see docs/domain/calculations/scoring_tables.md#b-bbee-recognition-levels
 */
const STANDARD_RECOGNITION_TABLE: Readonly<Record<number, number>> = {
  1: 1.35, 2: 1.25, 3: 1.10, 4: 1.00,
  5: 0.80, 6: 0.60, 7: 0.50, 8: 0.10, 0: 0,
};

/**
 * Line items the Codes EXCLUDE from Total Measured Procurement Spend (Statement
 * 000 §9 / Schedule 1): salaries & employee costs, pension/provident funds,
 * taxes and statutory levies, and pure financial arrangements (loans, interest,
 * bank charges, dividends). A B-BBEE gathering workbook often lists these in the
 * creditors schedule, but they are NOT procurement of goods/services and must
 * not earn B-BBEE recognition. Keywords are deliberately unambiguous — a real
 * trading supplier is not called "PAYE" or "Provident Fund".
 */
const TMPS_EXCLUSION_PATTERNS: ReadonlyArray<RegExp> = [
  /\b(provident|pension|retirement)\s+fund\b/i,
  /\bbargaining\s+council\b/i,
  /\b(paye|uif|sdl|vat)\b/i,
  /\b(income\s+tax|sars)\b/i,
  /\bbank\s+charges\b/i,
  /\bfinance\s+charges\b/i,
  /\bloan\b/i,
  /\bdividend/i,
  /\b(salaries|salary|wages|payroll|remuneration)\b/i,
];

/** True when a supplier line is a Codes-excluded item, not procurement spend. */
export function isTmpsExclusion(name: string | undefined | null): boolean {
  const n = String(name ?? '').trim();
  if (!n) return false;
  return TMPS_EXCLUSION_PATTERNS.some((re) => re.test(n));
}

export interface ProcurementSubLine {
  name: string;
  target: string;
  weighting: number;
  score: number;
  spend: number;
  isBonus?: boolean;
  /** The line's arithmetic in plain English, e.g. "R137.3m ÷ R199.8m = 68.7% ÷ 80% × 5 = 4.29". */
  note?: string;
}

// Issue 3: Removed graduationBonus and jobsCreatedBonus from result (ED only bonuses)
export interface ProcurementResult {
  base: number;
  empoweringSuppliers: number;
  qseSuppliers: number;
  emeSuppliers: number;
  blackOwned51: number;
  blackFemaleOwned30: number;
  designatedGroup: number;
  total: number;
  /** The total before rounding: the scorecard adds these, as the toolkit adds full precision. */
  exactTotal?: number;
  subMinimumMet: boolean;
  /**
   * Data-integrity findings that changed how the pillar scored — e.g. a TMPS
   * smaller than its own supplier schedule, treated as missing. Rendered as an
   * amber banner on the pillar page; empty on a clean case.
   */
  dataFlags: string[];
  recognisedSpend: number;
  target: number;
  /**
   * What every line is a share of: the larger of TMPS and the supplier listing
   * × (1 + buffer) — the toolkit's MAX('Procurement Scorecard'!C3:C4).
   */
  denominator: number;
  subLines: ProcurementSubLine[];
  /** Honest notes — e.g. Codes-excluded spend (loans, funds, levies) removed from recognition. */
  coverageNotes?: string[];
  rawStats: {
    spendAllBlackOwned: number;
    spendBlackWomenOwned: number;
    spendQSE: number;
    spendEME: number;
    designatedGroupSpend: number;
    empoweringSpend: number;
    blackOwned51Spend: number;
    blackFemaleOwned30Spend: number;
    /** Recognised spend with ≥35% / ≥51% black-women-owned suppliers (Construction PP). */
    blackWomen35Spend: number;
    blackWomen51Spend: number;
    foreignSupplierSpend: number; // Issue 3: Added for TMPS tracking
  };
}

function getRecognitionMultiplier(beeLevel: number, config?: CalculatorConfig): number {
  if (config?.recognitionTable && Array.isArray(config.recognitionTable)) {
    const entry = config.recognitionTable.find(e => e.level === beeLevel);
    if (entry) return entry.multiplier;
  }
  return STANDARD_RECOGNITION_TABLE[beeLevel] ?? 0;
}


type EnterpriseSize = 'eme' | 'qse' | 'generic';

/** 'Large' is the Generic band; anything unrecognised is unknown, not Generic. */
function normaliseSize(value: unknown): EnterpriseSize | undefined {
  const s = String(value ?? '').trim().toLowerCase();
  if (s === 'eme' || s === 'qse' || s === 'generic') return s;
  if (s === 'large') return 'generic';
  return undefined;
}

const OWNED_51 = 0.51;
/** Procurement Data[All Spend adjusted PLUS x1.2 Factor]. */
const ENHANCED_RECOGNITION = 1.2;
/** Procurement Data[QSE Spend] / [EME Spend]: "Years of being a supplier" ≤ 5. */
const GRADUATION_WINDOW_YEARS = 5;

export type EnhancedRecognitionRule =
  | 'black_owned_small_supplier'
  | 'flow_through'
  | 'black_owned_small_supplier_or_first_time';

/**
 * The 1.2 recognition factor (Procurement Data, the "Qualify for 1.2
 * Recognition factor?" columns, OR-ed). Every Empower template applies it; two
 * versions of who earns it exist:
 *
 * 'flow_through' — RCOGP Generic v1.4:
 *   - ≥51% black owned AND ≥51% flow-through black owned (any size), or
 *   - a QSE/EME at ≥51% flow-through that is a Supplier Development
 *     beneficiary on a contract of at least three years.
 *   Its third branch ("Generic AND QSE-or-EME") can never be true; not ported.
 *
 * 'black_owned_small_supplier' — RCOGP QSE, ICT, FSC and AgriBEE templates:
 *   a QSE/EME ≥51% black owned that is a Supplier Development beneficiary or
 *   holds a 3-year contract. Their "first-time supplier" branch is the rule
 *   below, which a sector opts into.
 *
 * 'black_owned_small_supplier_or_first_time' — RCOGP QSE v1.1, ICT Generic
 *   v1.4, ICT QSE v1.1, FSC v1.0 and AgriBEE Generic v1.0.1 as they mean it:
 *   the rule above, or a QSE/EME ≥51% black owned first-time supplier
 *   (Supplier.isFirstTimeSupplier).
 *   The RCOGP QSE, ICT Generic and AgriBEE templates' own first-time test
 *   reads the 3-year-contract answer instead (a copy slip), so in those
 *   spreadsheets the first-time answer never counts.
 */
export function qualifiesForEnhancedRecognition(
  sup: Supplier,
  rule: EnhancedRecognitionRule = 'black_owned_small_supplier',
): boolean {
  const size = normaliseSize(sup.enterpriseType);
  if (!size) return false;
  const small = size === 'qse' || size === 'eme';
  const bo = Number(sup.blackOwnership) || 0;
  if (rule === 'black_owned_small_supplier' || rule === 'black_owned_small_supplier_or_first_time') {
    const firstTime = rule === 'black_owned_small_supplier_or_first_time' && Boolean(sup.isFirstTimeSupplier);
    return small && bo >= OWNED_51
      && (Boolean(sup.isSupplierDevRecipient) || Boolean(sup.hasThreeYearContract) || firstTime);
  }
  const ft = Number(sup.flowThroughOwnership) || 0;
  if (bo >= OWNED_51 && ft >= OWNED_51) return true;
  return small
    && ft >= OWNED_51
    && Boolean(sup.isSupplierDevRecipient)
    && Boolean(sup.hasThreeYearContract);
}

/**
 * A Generic supplier still counts on the QSE (or EME) line when it was a QSE
 * (EME) at first procurement, is ≥51% black owned and ≥51% flow-through black
 * owned, and was first procured from no more than five years ago.
 *
 * The toolkit counts those years to TODAY(), so a closed year's score drifts
 * as the calendar moves; they are counted to the measurement-period end here.
 * Without that date the five-year test cannot be judged ('unjudged').
 */
function graduatedOnto(
  sup: Supplier,
  band: 'qse' | 'eme',
  asOf: Date | null,
): 'yes' | 'no' | 'unjudged' {
  if (normaliseSize(sup.enterpriseType) !== 'generic') return 'no';
  if (normaliseSize(sup.sizeAtFirstProcurement) !== band) return 'no';
  if ((Number(sup.blackOwnership) || 0) < OWNED_51) return 'no';
  if ((Number(sup.flowThroughOwnership) || 0) < OWNED_51) return 'no';
  const first = parseCalcDate(sup.firstProcurementDate);
  if (!first) return 'no';
  if (!asOf) return 'unjudged';
  return yearFracActual360(first, asOf) <= GRADUATION_WINDOW_YEARS ? 'yes' : 'no';
}

/**
 * Designated-group supplier: ≥51% black owned AND ≥51% owned by black
 * designated groups (Procurement Data[BDG Spend]). A record with no
 * designated-group ownership figure falls back to the flags older captures
 * carry: an explicit "designated group" answer, or youth / disability
 * ownership.
 */
function isDesignatedGroupSupplier(sup: Supplier): boolean {
  if ((Number(sup.blackOwnership) || 0) < OWNED_51) return false;
  const dg = Number(sup.designatedGroupOwnership);
  if (Number.isFinite(dg) && dg > 0) return dg >= OWNED_51;
  return Boolean(sup.isDesignatedGroup) || (sup.youthOwnership ?? 0) > 0 || (sup.disabledOwnership ?? 0) > 0;
}

/**
 * @domain-rule pillar:procurement, slides:58,61,62
 * @see docs/domain/pillars/04_preferential_procurement.md#scorecard
 * @see docs/domain/calculations/tmps_calculation.md
 * VERIFIED AGAINST: BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx, line by line
 * (Procurement Scorecard F9:F15, Procurement Data computed columns).
 *
 * Kept on purpose, beyond the toolkit: a supplier line named as a
 * Codes-excluded item (loan, provident fund, PAYE…) and a foreign supplier earn
 * no recognition. Both still count in the supplier listing the denominator is
 * compared against, as every listed rand does in the toolkit.
 */
export function calculateProcurementScore(data: ProcurementData, config?: CalculatorConfig): ProcurementResult {
  const { sectorCode, scorecardType } = resolveSectorContext(config);
  const pc = requireSectorConfig(
    sectorCode,
    'procurement',
    config?.procurement as Record<string, unknown> | undefined,
    scorecardType,
  ) as NonNullable<CalculatorConfig['procurement']>;
  const { tmps } = data;
  const suppliers = data.suppliers || [];

  // ── DENOMINATOR ───────────────────────────────────────────────────────
  // The toolkit measures every line against MAX(TMPS, supplier listing ×
  // (1 + buffer)) — 'Procurement Scorecard'!C3 and C4. A TMPS smaller than the
  // schedule it must contain therefore cannot shrink the denominator.
  //
  // That is also what disarms the misplaced-TMPS case this file used to zero
  // out: a real client pack arrived with tmps = 23 (SheetJS's error code for a
  // #REF! cell read off the Finance sheet), and spend / 23 ran 137,000x over
  // target. Under the larger-of rule that pack is measured against its own
  // schedule instead; the implausible TMPS is still flagged.
  const dataFlags: string[] = [];
  const coverageNotes: string[] = [];
  /** Suppliers recognised on their B-BBEE level with no empowering status on record. */
  let unstatedEmpowering = 0;
  /** Suppliers answered "not empowering" but counted, because this sector's toolkit ignores the answer. */
  let notEmpoweringButCounted = 0;
  const rawBuffer = Number(data.tmpsBuffer);
  const buffer = Number.isFinite(rawBuffer) && rawBuffer > 0 ? rawBuffer : 0;
  const listedSpend = supplierSumTmps(suppliers.map((s) => ({ spend: Number(s.spend) || 0 })));
  const listing = listedSpend * (1 + buffer);
  const measuredTmps = tmps > 0 ? tmps : 0;
  const denominator = Math.max(measuredTmps, listing);
  const denominatorLabel = listing > measuredTmps ? 'supplier listing' : 'TMPS';
  const listingText = `${formatRand(listing)}${buffer > 0 ? ` (listing plus a ${formatPct(buffer)} buffer)` : ''}`;

  if (tmps > 0 && suppliers.length > 0) {
    const largestSupplierSpend = suppliers.reduce((m, s) => Math.max(m, Number(s.spend) || 0), 0);
    if (largestSupplierSpend > tmps * 2) {
      dataFlags.push(
        `Total Measured Procurement Spend (R${Math.round(tmps).toLocaleString('en-ZA')}) is smaller than the supplier schedule it must contain ` +
        `(largest single supplier R${Math.round(largestSupplierSpend).toLocaleString('en-ZA')}, schedule total R${Math.round(listedSpend).toLocaleString('en-ZA')}). ` +
        'The figure is misplaced or mis-scaled — a row count or an R\'000 figure, not Rand. Every line is measured against the supplier ' +
        `listing instead (${listingText}), the larger of the two, as the toolkit does; enter the real TMPS.`,
      );
    } else if (listing > tmps) {
      coverageNotes.push(
        `TMPS (${formatRand(tmps)}) is smaller than the supplier listing ${listingText}. Like the toolkit, every line is ` +
        'measured against the larger of the two — here the listing.',
      );
    }
  }

  const allSuppliersTarget = pc.allSuppliersTarget ?? 0.80;
  const allSuppliersMaxPts = pc.allSuppliersMaxPts ?? 5;
  const qseTarget = pc.qseTarget ?? 0.15;
  const qseMaxPts = pc.qseMaxPts ?? 3;
  const emeTarget = pc.emeTarget ?? 0.15;
  const emeMaxPts = pc.emeMaxPts ?? 4;
  const bo51Target = pc.bo51Target ?? 0.50;
  const bo51MaxPts = pc.bo51MaxPts ?? 11;
  const bwo30Target = pc.bwo30Target ?? 0.12;
  const bwo30MaxPts = pc.bwo30MaxPts ?? 4;
  const dgTarget = pc.dgTarget ?? 0.02;
  const dgMaxPts = pc.dgMaxPts ?? 2;
  const ignoreEmpoweringFlag = pc.allSuppliersIgnoreEmpoweringFlag === true;
  const enhancedRule: EnhancedRecognitionRule = pc.enhancedRecognitionRule ?? 'black_owned_small_supplier';
  const countGraduates = pc.countGraduatedSuppliersAsSmall === true;

  const blackWomenThreshold = pc.blackWomenThreshold ?? 0.30;
  // No configured sub-minimum means NO sub-minimum (audit 2026-07-26 item 15).
  const subMinThreshold = config?.pillarConfigs?.preferentialProcurement?.subMinimumPercent ?? 0;
  const maxPoints = config?.pillarConfigs?.preferentialProcurement?.maxPoints ?? 29;

  const TARGET_ALL = denominator * allSuppliersTarget;
  const TARGET_QSE = denominator * qseTarget;
  const TARGET_EME = denominator * emeTarget;
  const TARGET_BO51 = denominator * bo51Target;
  const TARGET_BWO30 = denominator * bwo30Target;
  const TARGET_DG = denominator * dgTarget;

  const asOf = parseCalcDate(data.measurementPeriodEnd);
  let recognisedSpend = 0;
  let empoweringSpend = 0;
  let qseSpend = 0;
  let emeSpend = 0;
  let blackOwned51Spend = 0;
  let blackFemaleOwned30Spend = 0;
  let blackWomen35Spend = 0;
  let blackWomen51Spend = 0;
  let designatedGroupSpend = 0;
  let foreignSupplierSpend = 0;
  let excludedSpend = 0;
  let enhancedCount = 0;
  const graduated = { qse: 0, eme: 0 };
  const unjudgedGraduates: string[] = [];
  const excludedNames: string[] = [];

  for (const sup of suppliers) {
    const spend = Number(sup.spend) || 0;
    const size = normaliseSize(sup.enterpriseType);

    // Codes-excluded line (loan, provident fund, statutory levy, tax): never
    // earns B-BBEE recognition, even if the schedule tagged it with a level.
    if (isTmpsExclusion(sup.name)) {
      excludedSpend += spend;
      if (excludedNames.length < 8) excludedNames.push(`${sup.name} (R${Math.round(spend).toLocaleString()})`);
      continue;
    }

    if (sup.isForeignSupplier) {
      foreignSupplierSpend += spend;
      continue;
    }

    // Procurement Data[All Spend adjusted] × 1.2 where the supplier qualifies
    // ([All Spend adjusted PLUS x1.2 Factor]) — the figure every line sums.
    const adjusted = spend * getRecognitionMultiplier(sup.beeLevel, config);
    const enhanced = qualifiesForEnhancedRecognition(sup, enhancedRule);
    if (enhanced && adjusted > 0) enhancedCount += 1;
    const recognised = enhanced ? adjusted * ENHANCED_RECOGNITION : adjusted;
    recognisedSpend += recognised;

    // "Spend from all empowering suppliers": every supplier with a recognition
    // level counts, weighted by its multiplier (NC / level 0 → 0); L5-8 are
    // already discounted by their level. Where the sector's toolkit is the
    // reference (allSuppliersIgnoreEmpoweringFlag) the "Empowering Supplier?"
    // answer is not consulted at all — the toolkit's PPAllSpend sums every
    // row. Otherwise an explicit "No" excludes the supplier.
    // (DISCREPANCY-LEDGER rcogp/qse D-02; Excel Procurement Scorecard!H9.)
    if (ignoreEmpoweringFlag) {
      empoweringSpend += recognised;
      if (sup.isEmpoweringSupplier === false && recognised > 0) notEmpoweringButCounted += 1;
    } else if (sup.isEmpoweringSupplier ?? (sup.beeLevel >= 1 && sup.beeLevel <= 8)) {
      empoweringSpend += recognised;
      // Counted on their level, having never been asked about — reported
      // below so a verifier knows what the number rests on.
      if (sup.isEmpoweringSupplier === undefined && sup.beeLevel >= 1 && sup.beeLevel <= 8) {
        unstatedEmpowering += 1;
      }
    }

    const ontoQse = size === 'qse' ? 'yes' : countGraduates ? graduatedOnto(sup, 'qse', asOf) : 'no';
    const ontoEme = size === 'eme' ? 'yes' : countGraduates ? graduatedOnto(sup, 'eme', asOf) : 'no';
    if (ontoQse === 'yes') qseSpend += recognised;
    if (ontoEme === 'yes') emeSpend += recognised;
    if (size === 'generic' && ontoQse === 'yes') graduated.qse += 1;
    if (size === 'generic' && ontoEme === 'yes') graduated.eme += 1;
    if ((ontoQse === 'unjudged' || ontoEme === 'unjudged') && unjudgedGraduates.length < 8) {
      unjudgedGraduates.push(sup.name);
    }

    const bo = Number(sup.blackOwnership) || 0;
    const bwo = Number(sup.blackWomenOwnership) || 0;
    if (bo >= OWNED_51) blackOwned51Spend += recognised;
    if (bwo >= blackWomenThreshold) blackFemaleOwned30Spend += recognised;
    if (bwo >= 0.35) blackWomen35Spend += recognised;
    if (bwo >= 0.51) blackWomen51Spend += recognised;
    if (isDesignatedGroupSupplier(sup)) designatedGroupSpend += recognised;
  }

  const empoweringScore = clampScore(safeRatio(empoweringSpend, TARGET_ALL, allSuppliersMaxPts), allSuppliersMaxPts);
  const qseScore = clampScore(safeRatio(qseSpend, TARGET_QSE, qseMaxPts), qseMaxPts);
  const emeScore = clampScore(safeRatio(emeSpend, TARGET_EME, emeMaxPts), emeMaxPts);
  const blackOwned51Score = clampScore(safeRatio(blackOwned51Spend, TARGET_BO51, bo51MaxPts), bo51MaxPts);
  const blackFemaleOwned30Score = clampScore(safeRatio(blackFemaleOwned30Spend, TARGET_BWO30, bwo30MaxPts), bwo30MaxPts);
  const designatedGroupScore = clampScore(safeRatio(designatedGroupSpend, TARGET_DG, dgMaxPts), dgMaxPts);

  // Designated Group is a bonus indicator per RCOGP 2019
  const baseTotal = empoweringScore + qseScore + emeScore + blackOwned51Score + blackFemaleOwned30Score;
  const totalScore = clampScore(baseTotal + designatedGroupScore, maxPoints);

  // Sub-minimum excludes bonus points (DG is bonus per RCOGP 2019)
  const baseMaxPoints = allSuppliersMaxPts + qseMaxPts + emeMaxPts + bo51MaxPts + bwo30MaxPts;
  const subMinThresholdPoints = (subMinThreshold / 100) * baseMaxPoints;
  const alwaysPassSubMin = config?.procurement?.alwaysPassSubMin ?? false;

  const noteFor = (spend: number, target: number, max: number) =>
    ratioLineNote({ spend, denominator, denominatorLabel, target, maxPoints: max });
  const sizeNote = (n: number, band: string) => n > 0
    ? `; includes ${n} Generic supplier${n === 1 ? '' : 's'} first procured as a${band === 'EME' ? 'n' : ''} ${band} within the last five years`
    : '';

  const subLines: ProcurementSubLine[] = [
    { name: "B-BBEE Procurement Spend from Empowering Suppliers", target: `${(allSuppliersTarget * 100).toFixed(0)}% of TMPS`, weighting: allSuppliersMaxPts, score: empoweringScore, spend: empoweringSpend, note: noteFor(empoweringSpend, allSuppliersTarget, allSuppliersMaxPts) },
    { name: "Spend on QSE Empowering Suppliers", target: `${(qseTarget * 100).toFixed(0)}% of TMPS`, weighting: qseMaxPts, score: qseScore, spend: qseSpend, note: noteFor(qseSpend, qseTarget, qseMaxPts) + sizeNote(graduated.qse, 'QSE') },
    { name: "Spend on EME Suppliers", target: `${(emeTarget * 100).toFixed(0)}% of TMPS`, weighting: emeMaxPts, score: emeScore, spend: emeSpend, note: noteFor(emeSpend, emeTarget, emeMaxPts) + sizeNote(graduated.eme, 'EME') },
    { name: "Spend on Empowering Suppliers ≥51% Black Owned", target: `${(bo51Target * 100).toFixed(0)}% of TMPS`, weighting: bo51MaxPts, score: blackOwned51Score, spend: blackOwned51Spend, note: noteFor(blackOwned51Spend, bo51Target, bo51MaxPts) },
    { name: "Spend on Empowering Suppliers >30% Black Female Owned", target: `${(bwo30Target * 100).toFixed(0)}% of TMPS`, weighting: bwo30MaxPts, score: blackFemaleOwned30Score, spend: blackFemaleOwned30Spend, note: noteFor(blackFemaleOwned30Spend, bwo30Target, bwo30MaxPts) },
    { name: "Spend on Designated Group Suppliers ≥51% Black Owned", target: `${(dgTarget * 100).toFixed(0)}% of TMPS`, weighting: dgMaxPts, score: designatedGroupScore, spend: designatedGroupSpend, isBonus: true, note: noteFor(designatedGroupSpend, dgTarget, dgMaxPts) },
  ];

  const procTotal = round2(totalScore);

  /**
   * A schedule with no TMPS used to score 0 and say nothing; under the
   * larger-of rule it is measured against its own listing, and says so. It
   * goes in coverageNotes, not dataFlags, on purpose — a missing figure is a
   * gap, not a misplaced one, and that distinction is pinned by its own test.
   */
  if (tmps <= 0 && suppliers.length > 0) {
    coverageNotes.push(
      `Total Measured Procurement Spend is ${tmps < 0 ? "negative" : "not set"} while ${suppliers.length} ` +
      `supplier${suppliers.length === 1 ? "" : "s"} totalling R${Math.round(listedSpend).toLocaleString("en-ZA")} ` +
      `are captured. Like the toolkit, every Preferential Procurement line is measured against the larger of TMPS ` +
      `and the supplier listing — here the listing (${listingText}). Enter the measured TMPS if it is larger.`,
    );
  }
  if (excludedSpend > 0) {
    coverageNotes.push(
      `Excluded R${Math.round(excludedSpend).toLocaleString()} of Codes-excluded spend from B-BBEE recognition (loans, provident/pension funds, taxes, statutory levies): ${excludedNames.join(', ')}${excludedNames.length >= 8 ? ' …' : ''}. These are not procurement of goods/services.`,
    );
  }
  if (enhancedCount > 0) {
    coverageNotes.push(
      `${enhancedCount} supplier${enhancedCount === 1 ? "'s" : "s'"} recognised spend carries the 1.2 factor ` +
      (enhancedRule === 'flow_through'
        ? '(≥51% black and ≥51% flow-through black owned, or a QSE/EME Supplier Development beneficiary on a 3-year contract).'
        : enhancedRule === 'black_owned_small_supplier_or_first_time'
          ? '(a QSE/EME ≥51% black owned that is a Supplier Development beneficiary, holds a 3-year contract or is a first-time supplier).'
          : '(a QSE/EME ≥51% black owned that is a Supplier Development beneficiary or holds a 3-year contract).'),
    );
  }
  if (unjudgedGraduates.length > 0) {
    coverageNotes.push(
      `${unjudgedGraduates.join(', ')}: Generic now, first procured as a QSE/EME and ≥51% black owned — they count on the ` +
      'QSE/EME line only within five years of first procurement, and without the measurement-period end that cannot be ' +
      'judged, so they are not counted there.',
    );
  }
  if (notEmpoweringButCounted > 0) {
    coverageNotes.push(
      `${notEmpoweringButCounted} supplier${notEmpoweringButCounted === 1 ? ' is' : 's are'} marked "not empowering" but ` +
      'counted on the all-suppliers line: this sector\'s toolkit counts every supplier\'s recognised spend there.',
    );
  }
  if (unstatedEmpowering > 0) {
    coverageNotes.push(
      `${unstatedEmpowering} supplier${unstatedEmpowering === 1 ? " was" : "s were"} recognised on ` +
      `B-BBEE level alone — no empowering-supplier status is on record for ` +
      `${unstatedEmpowering === 1 ? "it" : "them"}. The Codes count every supplier holding a ` +
      'recognition level on this line, so the number is right; this says what it rests on.',
    );
  }

  return {
    base: round2(baseTotal),
    dataFlags,
    coverageNotes,
    empoweringSuppliers: round2(empoweringScore),
    qseSuppliers: round2(qseScore),
    emeSuppliers: round2(emeScore),
    blackOwned51: round2(blackOwned51Score),
    blackFemaleOwned30: round2(blackFemaleOwned30Score),
    designatedGroup: round2(designatedGroupScore),
    total: procTotal,
    exactTotal: totalScore,
    subMinimumMet:
      alwaysPassSubMin || (subMinThreshold > 0 ? baseTotal >= subMinThresholdPoints : true),
    recognisedSpend: round2(recognisedSpend),
    target: round2(TARGET_ALL),
    denominator: round2(denominator),
    subLines: subLines.map(l => ({ ...l, score: round2(l.score), spend: round2(l.spend) })),
    rawStats: {
      spendAllBlackOwned: round2(suppliers.filter(s => s.blackOwnership >= 0.51).reduce((acc, s) => acc + s.spend, 0)),
      spendBlackWomenOwned: round2(suppliers.filter(s => s.blackWomenOwnership >= blackWomenThreshold).reduce((acc, s) => acc + s.spend, 0)),
      spendQSE: round2(qseSpend),
      spendEME: round2(emeSpend),
      designatedGroupSpend: round2(designatedGroupSpend),
      empoweringSpend: round2(empoweringSpend),
      blackOwned51Spend: round2(blackOwned51Spend),
      blackFemaleOwned30Spend: round2(blackFemaleOwned30Spend),
      blackWomen35Spend: round2(blackWomen35Spend),
      blackWomen51Spend: round2(blackWomen51Spend),
      foreignSupplierSpend: round2(foreignSupplierSpend),
    },
  };
}

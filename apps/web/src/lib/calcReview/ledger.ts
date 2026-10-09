/**
 * The calculation ledger behind the Calculation Review page.
 *
 * WHO THIS IS FOR
 * A B-BBEE verification professional reviewing what Okiru actually computes —
 * not a developer. Every string in this file is written in the language of the
 * Codes: elements, indicators, compliance targets, weighting points, measured
 * entity, TMPS, leviable amount, NPAT. No code identifiers, no function names,
 * no file paths.
 *
 * WHERE THE NUMBERS COME FROM
 * Nothing here hardcodes a weighting or a compliance target. Every number shown
 * on the page is read live from the sector configuration the scoring engine
 * itself uses (served by GET /api/sectors). This file supplies only the
 * *narrative*: what the engine counts, what it divides by, how it awards the
 * points, and what it excludes.
 *
 * That split is deliberate. If a weighting is ever changed in the engine, this
 * page changes with it — it can never show a reviewer a target the calculator
 * is not using.
 *
 * REVIEW FLAGS
 * Some rows carry a `flag`. A flag is not an error message. It records a place
 * where the engine's behaviour is a *decision* — a fixed measure, a fallback, a
 * cap, a guard — that a reviewer should confirm against the gazette before
 * trusting a score. These are the first places to look when a client says "the
 * score does not match the data we entered".
 */

// ---------------------------------------------------------------------------
// Shapes served by GET /api/sectors
// ---------------------------------------------------------------------------

export interface PillarConfig {
  maxPoints: number;
  hasSubMinimum: boolean;
  subMinimumPercent: number;
  basePoints?: number;
  chooseOneGroup?: string;
  subElements?: Array<{
    criteria: string;
    points: number;
    target: string;
    formula: string;
    isBonus?: boolean;
  }>;
}

export interface SectorIndicatorRow {
  code: string;
  element: string;
  category: "main" | "bonus";
  name: string;
  weight: number;
  target: number | string;
  targetUnit: string;
  calculation: string;
}

export interface SectorConfigView {
  code: string;
  name: string;
  type: string;
  totalPoints: number;
  pillarConfigs: Record<string, PillarConfig | undefined>;
  targets: Record<string, Record<string, number | undefined> | undefined>;
  levelThresholds: Array<{ level: number; minPoints: number; recognition: number }>;
  indicators?: SectorIndicatorRow[];
}

// ---------------------------------------------------------------------------
// A row as the reviewer reads it
// ---------------------------------------------------------------------------

export interface LedgerRow {
  /** Stable identity for the note attached to this indicator. */
  code: string;
  /** Indicator name, as a verification professional would name it. */
  name: string;
  /** Weighting points available on this indicator. */
  weighting: number;
  /** Compliance target, already formatted for reading. */
  target: string;
  /** What the engine adds up (the numerator), in plain terms. */
  counts: string;
  /** What that total is measured against (the denominator). */
  against: string;
  /** How the weighting points are awarded off that comparison. */
  award: string;
  /** Bonus indicators sit outside the element's base weighting. */
  bonus?: boolean;
  /** A decision in the engine a reviewer should confirm. */
  flag?: string;
}

export interface PillarLedger {
  key: string;
  /** Element name in the Codes' language. */
  name: string;
  /** One sentence: what this element measures. */
  measures: string;
  /** Weighting points for the whole element (live from the engine). */
  weighting: number;
  /** Sub-minimum, if the element carries one. */
  subMinimum: string | null;
  rows: LedgerRow[];
  /** How the engine reads the client's submitted data for this element. */
  reading: string[];
  /** Element-level decisions worth confirming. */
  flags: string[];
  /** True when the engine has no indicator breakdown for this element. */
  empty?: boolean;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** A target stored as a fraction (0.25) → "25%". */
function asFraction(v: number | undefined): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return "—";
  const pct = v * 100;
  return Number.isInteger(pct) ? `${pct}%` : `${Number(pct.toFixed(2))}%`;
}

/** A target already stored as a percentage (3.5) → "3.5%". */
function asPercent(v: number | undefined): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return "—";
  return `${Number(v)}%`;
}

const PROPORTIONAL =
  "Achieved ÷ target, multiplied by the weighting points, capped at the weighting. Falling short of target scores proportionally; exceeding target earns no more than the weighting.";

const ALL_OR_NOTHING =
  "The full weighting if the condition is met, nothing if it is not. There is no partial award.";

function num(t: Record<string, number | undefined> | undefined, field: string): number | undefined {
  const v = t?.[field];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Keep a row only where the engine actually carries a weighting for it. */
function maybe(
  weighting: number | undefined,
  build: (weighting: number) => LedgerRow,
): LedgerRow[] {
  if (weighting === undefined || weighting <= 0) return [];
  return [build(weighting)];
}

// ---------------------------------------------------------------------------
// Element: Ownership
// ---------------------------------------------------------------------------

function ownershipLedger(cfg: SectorConfigView): PillarLedger {
  const t = cfg.targets?.ownership;
  const pc = cfg.pillarConfigs?.ownership;
  const isTransportLarge = cfg.code === "TRANSPORT" && cfg.type === "Generic";

  const rows: LedgerRow[] = [
    ...maybe(num(t, "votingRightsMaxPts"), (w) => ({
      code: "own.voting.black",
      name: "Voting rights — black people",
      weighting: w,
      target: asFraction(num(t, "votingRightsTarget")),
      counts:
        "Each shareholder's black voting percentage, weighted by that shareholder's share of the total shares on the register.",
      against: "The compliance target for black voting rights.",
      award: PROPORTIONAL,
    })),
    ...maybe(num(t, "womenVotingMaxPts"), (w) => ({
      code: "own.voting.blackwomen",
      name: "Voting rights — black women",
      weighting: w,
      target: asFraction(num(t, "womenVotingTarget")),
      counts:
        "Each shareholder's black-women voting percentage, weighted by that shareholder's share of the total shares.",
      against: "The compliance target for black-women voting rights.",
      award: PROPORTIONAL,
    })),
    ...maybe(num(t, "economicInterestMaxPts"), (w) => ({
      code: "own.ei.black",
      name: "Economic interest — black people",
      weighting: w,
      target: asFraction(num(t, "economicInterestTarget")),
      counts: "Black economic interest, weighted by each shareholder's share of the total shares.",
      against: "The compliance target for black economic interest.",
      award: PROPORTIONAL,
      flag:
        "REVIEW: economic interest is measured off the same black-ownership percentage captured for voting rights. Where a structure's economic interest differs from its voting rights, the engine has no separate field to read and will report the two as equal.",
    })),
    ...maybe(num(t, "womenEIMaxPts"), (w) => ({
      code: "own.ei.blackwomen",
      name: "Economic interest — black women",
      weighting: w,
      target: asFraction(num(t, "womenEITarget")),
      counts:
        "Black-women economic interest, weighted by each shareholder's share of the total shares.",
      against: "The compliance target for black-women economic interest.",
      award: PROPORTIONAL,
    })),
  ];

  // Designated-group economic interest. Transport (Large) reads the configured
  // target; every other code is measured against a fixed 10% inside the engine.
  if (isTransportLarge) {
    rows.push(
      ...maybe(num(t, "economicInterestDesignatedGroupMaxPts"), (w) => ({
        code: "own.ei.designated",
        name: "Economic interest — designated groups",
        weighting: w,
        target: asFraction(num(t, "economicInterestDesignatedGroupTarget") ?? 0.025),
        counts:
          "Black economic interest held by shareholders marked as designated-group (black youth, black people with disabilities, black people in rural or under-developed areas, black military veterans).",
        against: "The designated-group compliance target for this sector code.",
        award: PROPORTIONAL,
      })),
    );
  } else {
    const declaredTarget = num(t, "economicInterestDesignatedGroupTarget");
    const declaredPts = num(t, "economicInterestDesignatedGroupMaxPts");
    rows.push({
      code: "own.ei.designated",
      name: "Economic interest — designated groups / ownership schemes",
      weighting: 3,
      target: "10%",
      counts: "Black economic interest held by shareholders marked as designated-group.",
      against: "A 10% target fixed inside the engine.",
      award: PROPORTIONAL,
      flag:
        declaredTarget !== undefined
          ? `REVIEW: this sector's configuration declares a ${asFraction(declaredTarget)} target worth ${
              declaredPts ?? "—"
            } points, but the engine measures this indicator against a fixed 10% target worth 3 points and does not read the configured figures. A client sitting exactly on the gazetted target will therefore score below the weighting on this row.`
          : "REVIEW: the 10% target and the 3-point weighting on this row are fixed inside the engine rather than taken from this sector's configuration. Confirm both against the gazette for this code.",
    });
  }

  rows.push(
    ...maybe(num(t, "newEntrantsMaxPts"), (w) => ({
      code: "own.newentrants",
      name: "Economic interest — black new entrants",
      weighting: w,
      target:
        num(t, "newEntrantsTarget") !== undefined ? asFraction(num(t, "newEntrantsTarget")) : "2%",
      counts: "Whether any shareholder on the register is marked as a black new entrant.",
      against: "The presence of at least one such shareholder.",
      award: ALL_OR_NOTHING,
      bonus: true,
      flag:
        "REVIEW: this is awarded on the presence of a flagged new entrant only. The economic interest that new entrant actually holds is not measured, so a shareholder holding well under the target still collects the full weighting.",
    })),
    ...maybe(num(t, "netValueMaxPts"), (w) => ({
      code: "own.netvalue",
      name: "Net value",
      weighting: w,
      target: `${asFraction(num(t, "economicInterestTarget"))} economic interest, phased in over ten years`,
      counts:
        "For each black shareholder: the value of the entity attributable to that shareholder, less the acquisition debt attributable to them, divided by the carrying value of their shares — then weighted by their black ownership percentage.",
      against:
        "The black economic-interest target reduced by the time-based graduation factor for the years the shares have been held: 10% in year one, 20% year two, 40% year three, 60% year four, 80% year five, and 100% from year six.",
      award: PROPORTIONAL,
      flag:
        "REVIEW — three different measures sit behind this one row, and which one runs depends on what the client supplied. (1) Entity valuation AND share carrying values present: net value is calculated as described. (2) Acquisition debt recorded but NO valuation: the row scores zero, because debt cannot be netted without a value to net it against. (3) Neither a valuation nor any debt: the row falls back to measuring black economic interest against the graduated target. A client who omits a valuation can therefore score HIGHER on this row than one who supplies a valuation showing real outstanding debt.",
    })),
  );

  const subMinPct = pc?.subMinimumPercent ?? 0;
  const nvPts = num(t, "netValueMaxPts");
  const subMinimum =
    pc?.hasSubMinimum && subMinPct > 0 && nvPts
      ? `${subMinPct}% of the ${nvPts}-point net value indicator — that is, ${(
          (nvPts * subMinPct) /
          100
        ).toFixed(2)} points on net value alone. Missing it discounts the entity by one level.`
      : null;

  return {
    key: "ownership",
    name: "Ownership",
    measures:
      "The extent of black ownership of the measured entity, by voting rights, by economic interest, and by realised value net of the debt used to acquire it.",
    weighting: pc?.maxPoints ?? 0,
    subMinimum,
    rows,
    reading: [
      "Each shareholder is read from the shareholder register as: black ownership %, black-women ownership %, number of shares held, and the carrying value of those shares.",
      "A shareholder's influence on every indicator is weighted by its shares ÷ total shares on the register. Where no share numbers are captured at all, every shareholder is given an equal weight instead.",
      "Entity value, outstanding acquisition debt and years held are read once for the entity, not per shareholder, and are attributed to each shareholder in proportion to their shares.",
      "Every indicator is measured on its own evidence. Reaching the black voting-rights target does not award economic interest, black-women or net-value points.",
    ],
    flags: [
      "A negative net value is floored at zero per shareholder before aggregation, so it cannot pull the element's score down.",
      "The element total is capped at the element weighting, so bonus points cannot lift Ownership above its own maximum even where the sector code allows a scorecard total above 100.",
    ],
  };
}

// ---------------------------------------------------------------------------
// Element: Management Control
// ---------------------------------------------------------------------------

function managementLedger(cfg: SectorConfigView): PillarLedger {
  const mc = cfg.targets?.managementControl;
  const ee = cfg.targets?.employmentEquity;
  const pc = cfg.pillarConfigs?.managementControl;
  const hasSeparateEe = (cfg.pillarConfigs?.employmentEquity?.maxPoints ?? 0) > 0;
  const isTransportQse = cfg.code === "TRANSPORT" && cfg.type === "QSE";
  const isTransportLarge = cfg.code === "TRANSPORT" && cfg.type === "Generic";

  if (isTransportQse) {
    return {
      key: "managementControl",
      name: "Management Control",
      measures:
        "Black representation across the measured entity's top management, as a single combined indicator.",
      weighting: pc?.maxPoints ?? 0,
      subMinimum: null,
      rows: [
        {
          code: "mc.tq.black",
          name: "Black top management",
          weighting: 25,
          target: "50% + 1 (50.1%)",
          counts:
            "Headcount of black employees across board, executive directors, other executive management and senior management taken together.",
          against: "Total headcount in those same bands.",
          award: PROPORTIONAL,
        },
        {
          code: "mc.tq.blackwomen",
          name: "Black women in top management",
          weighting: 2,
          target: "25%",
          counts: "Headcount of black women across the same combined top-management bands.",
          against: "Total headcount in those bands.",
          award: PROPORTIONAL,
          bonus: true,
        },
      ],
      reading: [
        "Employees are grouped by the occupational level recorded against them. Board, Executive, Executive Director, Other Executive Management and Senior are pooled into one top-management population.",
        "Employees marked as foreign nationals are excluded from both the count and the total.",
        "Black means African, Coloured or Indian.",
      ],
      flags: [
        "The 50.1% and 25% targets, and the 25- and 2-point weightings, are written into the engine for Transport QSE rather than read from this sector's configuration.",
        "Middle and junior management do not appear in this element for Transport QSE; they are measured under Employment Equity instead.",
      ],
    };
  }

  if (isTransportLarge) {
    return {
      key: "managementControl",
      name: "Management Control",
      measures:
        "Black representation on the board, among executives, and across senior and middle management.",
      weighting: pc?.maxPoints ?? 0,
      subMinimum: null,
      rows: [
        { code: "mc.tl.board.b", name: "Black board members", weighting: 1.5, target: "50%", counts: "Black headcount on the board.", against: "Total board headcount.", award: PROPORTIONAL },
        { code: "mc.tl.board.bw", name: "Black women board members", weighting: 1.5, target: "25%", counts: "Black-women headcount on the board.", against: "Total board headcount.", award: PROPORTIONAL },
        { code: "mc.tl.exec.b", name: "Black executive directors", weighting: 1, target: "50%", counts: "Black headcount among executives and executive directors.", against: "Total headcount in those bands.", award: PROPORTIONAL },
        { code: "mc.tl.exec.bw", name: "Black women executive directors", weighting: 1, target: "25%", counts: "Black-women headcount among executives and executive directors.", against: "Total headcount in those bands.", award: PROPORTIONAL },
        { code: "mc.tl.senior.b", name: "Black senior management", weighting: 1.5, target: "40%", counts: "Black headcount in senior management.", against: "Total senior-management headcount.", award: PROPORTIONAL },
        { code: "mc.tl.senior.bw", name: "Black women senior management", weighting: 1.5, target: "20%", counts: "Black-women headcount in senior management.", against: "Total senior-management headcount.", award: PROPORTIONAL },
        { code: "mc.tl.middle.b", name: "Black middle management", weighting: 1, target: "40%", counts: "Black headcount in middle management.", against: "Total middle-management headcount.", award: PROPORTIONAL },
        { code: "mc.tl.middle.bw", name: "Black women middle management", weighting: 1, target: "20%", counts: "Black-women headcount in middle management.", against: "Total middle-management headcount.", award: PROPORTIONAL },
        {
          code: "mc.tl.ned",
          name: "Independent non-executive directors (bonus)",
          weighting: 1,
          target: "40%",
          counts: "Black headcount on the board.",
          against: "Total board headcount.",
          award: PROPORTIONAL,
          bonus: true,
          flag:
            "REVIEW: this bonus is measured on the board population as a whole against a 40% black target. Independence is not recorded anywhere in the submitted data, so the indicator cannot distinguish an independent non-executive director from any other board member.",
        },
      ],
      reading: [
        "Employees are grouped by recorded occupational level; foreign nationals are excluded.",
        "Black means African, Coloured or Indian. Black women means black and female.",
        "Employment Equity is a separate element for Transport (Large) and is scored on its own weighting.",
      ],
      flags: [
        "All targets and weightings on this element are written into the engine for Transport (Large) rather than read from this sector's configuration.",
      ],
    };
  }

  const rows: LedgerRow[] = [
    ...maybe(num(mc, "boardBlackMaxPts"), (w) => ({
      code: "mc.board.b",
      name: "Black board members",
      weighting: w,
      target: asFraction(num(mc, "boardBlackTarget")),
      counts: "Black headcount recorded at board level.",
      against: "Total board headcount.",
      award: PROPORTIONAL,
    })),
    ...maybe(num(mc, "boardBWMaxPts"), (w) => ({
      code: "mc.board.bw",
      name: "Black women board members",
      weighting: w,
      target: asFraction(num(mc, "boardBWTarget")),
      counts: "Black-women headcount recorded at board level.",
      against: "Total board headcount.",
      award: PROPORTIONAL,
    })),
    ...maybe(num(mc, "execBlackMaxPts"), (w) => ({
      code: "mc.exec.b",
      name: "Black executive directors",
      weighting: w,
      target: asFraction(num(mc, "execBlackTarget")),
      counts: "Black headcount recorded as Executive or Executive Director.",
      against: "Total headcount in those two bands.",
      award: PROPORTIONAL,
    })),
    ...maybe(num(mc, "execBWMaxPts"), (w) => ({
      code: "mc.exec.bw",
      name: "Black women executive directors",
      weighting: w,
      target: asFraction(num(mc, "execBWTarget")),
      counts: "Black-women headcount recorded as Executive or Executive Director.",
      against: "Total headcount in those two bands.",
      award: PROPORTIONAL,
    })),
    ...maybe(num(mc, "otherExecBlackMaxPts"), (w) => ({
      code: "mc.oexec.b",
      name: "Black other executive management",
      weighting: w,
      target: asFraction(num(mc, "otherExecBlackTarget")),
      counts: "Black headcount recorded as Other Executive Management.",
      against: "Total headcount in that band.",
      award: PROPORTIONAL,
    })),
    ...maybe(num(mc, "otherExecBWMaxPts"), (w) => ({
      code: "mc.oexec.bw",
      name: "Black women other executive management",
      weighting: w,
      target: asFraction(num(mc, "otherExecBWTarget")),
      counts: "Black-women headcount recorded as Other Executive Management.",
      against: "Total headcount in that band.",
      award: PROPORTIONAL,
    })),
    ...maybe(num(mc, "seniorMaxPts"), (w) => ({
      code: "mc.senior.b",
      name: "Black senior management",
      weighting: w,
      target: `${asFraction(num(mc, "seniorBlackTarget") ?? 0.6)} black, split across race and gender groups by the effective EAP`,
      counts:
        "Senior-management headcount in each of the six black demographic groups (African, Coloured and Indian, male and female), measured group by group.",
      against:
        "A per-group sub-target: the band's black target multiplied by that group's share of the effective Economically Active Population for the client's province. Each group also carries its own slice of the weighting, on the same share.",
      award:
        "Each demographic group earns its own slice of the weighting, proportionally and capped at that slice. The indicator score is the sum of the six. Over-representation in one group cannot make up for a shortfall in another.",
    })),
    ...maybe(num(mc, "seniorBWMaxPts"), (w) => ({
      code: "mc.senior.bw",
      name: "Black women senior management",
      weighting: w,
      target: `${asFraction(num(mc, "seniorBWTarget") ?? 0.3)} black women, split across African, Coloured and Indian women by EAP`,
      counts:
        "Senior-management headcount of African, Coloured and Indian women, measured group by group.",
      against:
        "A per-group sub-target from the black-female EAP for the province, re-based so the three female groups sum to 100%.",
      award: "As above: per-group slices, summed.",
    })),
    ...maybe(num(mc, "middleMaxPts"), (w) => ({
      code: "mc.middle.b",
      name: "Black middle management",
      weighting: w,
      target: `${asFraction(num(mc, "middleBlackTarget") ?? 0.75)} black, split by effective EAP`,
      counts: "Middle-management headcount in each of the six black demographic groups.",
      against: "The band target × each group's effective EAP share for the province.",
      award: "Per-group slices, summed.",
    })),
    ...maybe(num(mc, "middleBWMaxPts"), (w) => ({
      code: "mc.middle.bw",
      name: "Black women middle management",
      weighting: w,
      target: `${asFraction(num(mc, "middleBWTarget") ?? 0.38)} black women, split by EAP`,
      counts: "Middle-management headcount of African, Coloured and Indian women.",
      against: "The band target × each female group's re-based EAP share.",
      award: "Per-group slices, summed.",
    })),
    ...maybe(num(mc, "juniorMaxPts"), (w) => ({
      code: "mc.junior.b",
      name: "Black junior management",
      weighting: w,
      target: `${asFraction(num(mc, "juniorBlackTarget") ?? 0.88)} black, split by effective EAP`,
      counts:
        "Headcount in each of the six black demographic groups across junior management, semi-skilled and unskilled taken together.",
      against: "The band target × each group's effective EAP share.",
      award: "Per-group slices, summed.",
      flag:
        "REVIEW: junior management, semi-skilled and unskilled employees are pooled into a single population for this indicator. Where a code scores those bands separately, this will not reproduce it.",
    })),
    ...maybe(num(mc, "juniorBWMaxPts"), (w) => ({
      code: "mc.junior.bw",
      name: "Black women junior management",
      weighting: w,
      target: `${asFraction(num(mc, "juniorBWTarget") ?? 0.44)} black women, split by EAP`,
      counts: "Headcount of African, Coloured and Indian women across junior, semi-skilled and unskilled.",
      against: "The band target × each female group's re-based EAP share.",
      award: "Per-group slices, summed.",
    })),
  ];

  const stPts = num(mc, "seniorMaxPts");
  const stBwPts = num(mc, "seniorBWMaxPts");
  if (stPts) {
    rows.push({
      code: "mc.skilledtech.b",
      name: "Black skilled technical employees",
      weighting: stPts,
      target: "The provincial EAP black target for the skilled-technical band",
      counts: "Black headcount recorded as Skilled Technical.",
      against: "Total skilled-technical headcount.",
      award: PROPORTIONAL,
      flag: `REVIEW: this indicator is scored for every sector code and borrows the senior-management weighting (${stPts} points, and ${
        stBwPts ?? 0
      } for its black-women row). It is measured against a legacy aggregate EAP table rather than the per-demographic effective EAP used by the senior, middle and junior rows. Confirm whether this code has a skilled-technical indicator at all — where it does not, these points are being added to the element total on top of the gazetted rows.`,
    });
  }
  if (stBwPts) {
    rows.push({
      code: "mc.skilledtech.bw",
      name: "Black women skilled technical employees",
      weighting: stBwPts,
      target: "The provincial EAP black-female target for the skilled-technical band",
      counts: "Black-women headcount recorded as Skilled Technical.",
      against: "Total skilled-technical headcount.",
      award: PROPORTIONAL,
    });
  }

  if (!hasSeparateEe) {
    rows.push(
      ...maybe(num(ee, "disabledMaxPts"), (w) => ({
        code: "mc.disabled",
        name: "Black employees with disabilities",
        weighting: w,
        target: asFraction(num(ee, "disabledTarget")),
        counts: "Black headcount among employees marked as having a disability.",
        against:
          "TOTAL headcount of the measured entity — not the number of employees with disabilities.",
        award: PROPORTIONAL,
      })),
    );
  }

  const subMinPct = pc?.subMinimumPercent ?? 0;
  const subMinimum =
    pc?.hasSubMinimum && subMinPct > 0
      ? `${subMinPct}% of the element's ${pc?.maxPoints ?? 0} points.`
      : null;

  return {
    key: "managementControl",
    name: hasSeparateEe ? "Management Control" : "Management Control and Employment Equity",
    measures:
      "Black representation at every level of management, measured band by band, with the senior, middle and junior bands measured against the Economically Active Population.",
    weighting: pc?.maxPoints ?? 0,
    subMinimum,
    rows,
    reading: [
      "Every employee is read as: occupational level, race, gender, disability status, and whether they are a foreign national.",
      "Employees marked as foreign nationals are excluded from every count and every denominator in this element.",
      "Black means African, Coloured or Indian. Black women means black and female.",
      "Each band is measured only against its own population. A band with no employees recorded scores zero on its rows — it does not inherit the entity average.",
      "The senior, middle and junior bands use the effective EAP for the client's province: the published EAP with the white groups removed and the remaining six groups re-based to 100%. Where no province is recorded, the national figures are used.",
    ],
    flags: [
      "The element total is capped at the element weighting.",
      "The occupational level recorded against an employee decides which band they are measured in. An employee whose level is not one of the recognised band names is counted in the entity total but in none of the band rows.",
    ],
  };
}

// ---------------------------------------------------------------------------
// Element: Employment Equity (only where the code scores it separately)
// ---------------------------------------------------------------------------

function employmentEquityLedger(cfg: SectorConfigView): PillarLedger | null {
  const pc = cfg.pillarConfigs?.employmentEquity;
  if (!pc || pc.maxPoints <= 0) return null;

  const isTransportQse = cfg.code === "TRANSPORT" && cfg.type === "QSE";
  const ee = cfg.targets?.employmentEquity;

  if (isTransportQse) {
    return {
      key: "employmentEquity",
      name: "Employment Equity",
      measures:
        "Black representation across management as a whole, and across the entity's total workforce.",
      weighting: pc.maxPoints,
      subMinimum: null,
      rows: [
        { code: "ee.tq.mgmt.b", name: "Black employees in management", weighting: 7.5, target: "40%", counts: "Black headcount across board, executive, other executive, senior, middle and junior management.", against: "Total headcount across those bands.", award: PROPORTIONAL },
        { code: "ee.tq.mgmt.bw", name: "Black women in management", weighting: 7.5, target: "20%", counts: "Black-women headcount across the same management bands.", against: "Total headcount across those bands.", award: PROPORTIONAL },
        { code: "ee.tq.all.b", name: "Black employees — total workforce", weighting: 5, target: "60%", counts: "Black headcount across the entire workforce.", against: "Total workforce headcount.", award: PROPORTIONAL },
        { code: "ee.tq.all.bw", name: "Black women — total workforce", weighting: 5, target: "30%", counts: "Black-women headcount across the entire workforce.", against: "Total workforce headcount.", award: PROPORTIONAL },
        {
          code: "ee.tq.eapbonus",
          name: "EAP representation bonus",
          weighting: 2,
          target:
            "Senior, middle and junior bands all at or above their provincial EAP black and black-female targets",
          counts: "Whether every one of those six band tests passes.",
          against: "All six tests simultaneously.",
          award: ALL_OR_NOTHING,
          bonus: true,
          flag:
            "REVIEW: all six band tests must pass for the bonus. A single band below its EAP target forfeits the whole bonus, and a band with no employees recorded reads as zero representation and so fails — except the pooled junior / semi-skilled / unskilled population, which is skipped entirely when it is empty.",
        },
      ],
      reading: [
        "Foreign nationals are excluded from every count and denominator.",
        "The EAP bonus uses a legacy aggregate provincial table of black and black-female targets per band, not the per-demographic effective EAP.",
      ],
      flags: [
        "All targets and weightings on this element are written into the engine for Transport QSE rather than read from this sector's configuration.",
      ],
    };
  }

  return {
    key: "employmentEquity",
    name: "Employment Equity",
    measures: "Black representation per occupational band, and among employees with disabilities.",
    weighting: pc.maxPoints,
    subMinimum:
      pc.hasSubMinimum && pc.subMinimumPercent > 0
        ? `${pc.subMinimumPercent}% of the element's ${pc.maxPoints} points.`
        : null,
    rows: [
      ...maybe(num(ee, "seniorMaxPts"), (w) => ({
        code: "ee.senior",
        name: "Black senior management",
        weighting: w,
        target: "Per the sector sheet",
        counts: "Black headcount in senior management.",
        against: "Total senior-management headcount.",
        award: PROPORTIONAL,
      })),
      ...maybe(num(ee, "middleMaxPts"), (w) => ({
        code: "ee.middle",
        name: "Black middle management",
        weighting: w,
        target: "Per the sector sheet",
        counts: "Black headcount in middle management.",
        against: "Total middle-management headcount.",
        award: PROPORTIONAL,
      })),
      ...maybe(num(ee, "juniorMaxPts"), (w) => ({
        code: "ee.junior",
        name: "Black junior management",
        weighting: w,
        target: "Per the sector sheet",
        counts: "Black headcount in junior management.",
        against: "Total junior-management headcount.",
        award: PROPORTIONAL,
      })),
      ...maybe(num(ee, "disabledMaxPts"), (w) => ({
        code: "ee.disabled",
        name: "Black employees with disabilities",
        weighting: w,
        target: asFraction(num(ee, "disabledTarget")),
        counts: "Black headcount among employees marked as having a disability.",
        against: "Total headcount of the measured entity.",
        award: PROPORTIONAL,
      })),
      ...maybe(num(ee, "disabledWomenMaxPts"), (w) => ({
        code: "ee.disabled.women",
        name: "Black women with disabilities",
        weighting: w,
        target: asFraction(num(ee, "disabledWomenTarget")),
        counts: "Black-women headcount among employees marked as having a disability.",
        against: "Total headcount of the measured entity.",
        award: PROPORTIONAL,
      })),
    ],
    reading: [
      "Foreign nationals are excluded from every count and denominator.",
      "Disability indicators are measured against the entity's total headcount, not against the disabled population.",
    ],
    flags: [],
  };
}

// ---------------------------------------------------------------------------
// Element: Skills Development
// ---------------------------------------------------------------------------

function skillsLedger(cfg: SectorConfigView): PillarLedger {
  const sk = cfg.targets?.skills;
  const pc = cfg.pillarConfigs?.skillsDevelopment;
  const isTransportLarge = cfg.code === "TRANSPORT" && cfg.type === "Generic";

  const rows: LedgerRow[] = [
    ...maybe(num(sk, "learningProgrammesMaxPts"), (w) => ({
      code: "sd.learning",
      name: "Skills development expenditure on learning programmes for black people",
      weighting: w,
      target: `${asPercent(num(sk, "overallSpendPercent"))} of the leviable amount`,
      counts:
        "Recognised training spend on black learners, totalled by learning-programme category A to F. Category E is capped at 25% of all training spend and category F at 15%.",
      against: `${asPercent(num(sk, "overallSpendPercent"))} of the leviable amount captured for the entity.`,
      award: PROPORTIONAL,
      flag:
        "REVIEW — two filters decide what is counted. (1) Only programmes marked as having a black learner are counted at all; a line with no race recorded contributes nothing. (2) Category G spend is excluded from recognised expenditure entirely, while still counting toward the total used to calculate the category E and F caps.",
    })),
    ...maybe(num(sk, "bursaryMaxPts"), (w) => ({
      code: "sd.bursary",
      name: "Bursaries for black students",
      weighting: w,
      target: `${asPercent(num(sk, "bursarySpendPercent"))} of the leviable amount`,
      counts: "Spend on black learners whose programme is category A or is recorded as a bursary.",
      against: `${asPercent(num(sk, "bursarySpendPercent"))} of the leviable amount.`,
      award: PROPORTIONAL,
    })),
    ...maybe(num(sk, "disabledLearningMaxPts"), (w) => ({
      code: "sd.disabled",
      name: "Learning programmes for black employees with disabilities",
      weighting: w,
      target: `${asPercent(num(sk, "disabledSpendPercent"))} of the leviable amount`,
      counts: "Spend on black learners marked as having a disability.",
      against: `${asPercent(num(sk, "disabledSpendPercent"))} of the leviable amount.`,
      award: PROPORTIONAL,
    })),
  ];

  if (isTransportLarge) {
    rows.push(
      ...maybe(num(sk, "learnershipsMaxPts"), (w) => ({
        code: "sd.programmes.black",
        name: "Black people in category B, C and D programmes",
        weighting: w,
        target: `${asPercent(num(sk, "learnershipTargetPercent"))} of total headcount`,
        counts: "Number of black learners on category B, C or D programmes.",
        against: `${asPercent(num(sk, "learnershipTargetPercent"))} of the entity's headcount.`,
        award: PROPORTIONAL,
      })),
      ...maybe(num(sk, "absorptionMaxPts"), (w) => ({
        code: "sd.programmes.women",
        name: "Black women in category B, C and D programmes",
        weighting: w,
        target: `${asPercent(num(sk, "absorptionTargetPercent"))} of total headcount`,
        counts: "Number of black women learners on category B, C or D programmes.",
        against: `${asPercent(num(sk, "absorptionTargetPercent"))} of the entity's headcount.`,
        award: PROPORTIONAL,
        flag:
          "REVIEW: for Transport (Large) the engine uses the absorption target figure as the black-women programme-participation target. Confirm that is what the sector sheet intends.",
      })),
    );
  } else {
    rows.push(
      ...maybe(num(sk, "learnershipsMaxPts"), (w) => ({
        code: "sd.learnerships",
        name: "Black people on learnerships, apprenticeships and internships",
        weighting: w,
        target: `${asPercent(num(sk, "learnershipTargetPercent"))} of total headcount`,
        counts: "Number of black learners on category B, C or D programmes.",
        against: `${asPercent(
          num(sk, "learnershipTargetPercent"),
        )} of the entity's headcount, with a floor of one learner where that calculation gives less than one.`,
        award: PROPORTIONAL,
      })),
      ...maybe(num(sk, "absorptionMaxPts"), (w) => ({
        code: "sd.absorption",
        name: "Absorption of learners on completion",
        weighting: w,
        target: asPercent(num(sk, "absorptionTargetPercent")),
        counts: "Number of black learners marked as absorbed.",
        against:
          "ALL black learners on the training schedule — not only those who completed a category B, C or D programme.",
        award: PROPORTIONAL,
        bonus: true,
        flag:
          "REVIEW: the absorption rate's denominator is every black learner recorded, including short courses and bursary holders. Where the code measures absorption only against unemployed learners who completed a qualifying programme, this denominator is wider and the rate will read lower.",
      })),
    );
  }

  const subMinPct = pc?.subMinimumPercent ?? 0;
  const subMinimum =
    pc?.hasSubMinimum && subMinPct > 0
      ? `${subMinPct}% of the element's ${pc?.maxPoints ?? 0} points — ${(
          ((pc?.maxPoints ?? 0) * subMinPct) /
          100
        ).toFixed(2)} points. Missing it discounts the entity by one level.`
      : null;

  return {
    key: "skillsDevelopment",
    name: "Skills Development",
    measures:
      "Training expenditure on black people as a proportion of the leviable amount, and the number of black learners placed on and absorbed after qualifying programmes.",
    weighting: pc?.maxPoints ?? 0,
    subMinimum,
    rows,
    reading: [
      "Each training line is read as: cost, learning-programme category, whether the learner is black, whether the learner has a disability, and whether the learner was absorbed.",
      "The leviable amount is read once for the entity and is the denominator for all three expenditure indicators.",
      "Where no learning-programme category is recorded, the line is treated as category D. A bursary is read as A, a learnership or internship as B, and a short course as C.",
      "Headcount for the participation indicator is the entity headcount captured in the financial data; where that is missing, the number of employees on the employee schedule is used instead.",
    ],
    flags: [
      "A training line with no race recorded is not counted by any indicator in this element, and nothing on the scorecard says so. A missing race field and a white learner produce the same result.",
      "Where a line's category is unrecognised it is counted as category D — which IS recognised expenditure — rather than being set aside.",
      "The element total is capped at the element weighting.",
    ],
  };
}

// ---------------------------------------------------------------------------
// Element: Preferential Procurement
// ---------------------------------------------------------------------------

function procurementLedger(cfg: SectorConfigView): PillarLedger {
  const p = cfg.targets?.procurement;
  const pc = cfg.pillarConfigs?.preferentialProcurement;
  const isTransportLarge = cfg.code === "TRANSPORT" && cfg.type === "Generic";

  const rows: LedgerRow[] = [
    ...maybe(num(p, "allSuppliersMaxPts"), (w) => ({
      code: "pp.all",
      name: "Procurement from all empowering suppliers",
      weighting: w,
      target: `${asFraction(num(p, "allSuppliersTarget"))} of TMPS`,
      counts:
        "The full rand spend with every supplier holding a B-BBEE level between 1 and 8, added up at face value.",
      against: `${asFraction(num(p, "allSuppliersTarget"))} of Total Measured Procurement Spend.`,
      award: PROPORTIONAL,
      flag:
        "REVIEW — the single most likely source of a score that does not match a client's expectation. The engine adds each supplier's spend at 100% regardless of that supplier's B-BBEE level. It does NOT apply the recognition percentage for the level (135% for a Level 1, 100% for a Level 4, 10% for a Level 8). A schedule of Level 8 suppliers therefore scores exactly the same as a schedule of Level 1 suppliers on this row.",
    })),
    ...maybe(num(p, "qseMaxPts"), (w) => ({
      code: "pp.qse",
      name: isTransportLarge ? "Procurement from QSEs and EMEs" : "Procurement from QSEs",
      weighting: w,
      target: `${asFraction(num(p, "qseTarget"))} of TMPS`,
      counts: isTransportLarge
        ? "Spend with suppliers classified as either QSE or EME."
        : "Spend with suppliers classified as QSE.",
      against: `${asFraction(num(p, "qseTarget"))} of TMPS.`,
      award: PROPORTIONAL,
    })),
  ];

  if (!isTransportLarge) {
    rows.push(
      ...maybe(num(p, "emeMaxPts"), (w) => ({
        code: "pp.eme",
        name: "Procurement from EMEs",
        weighting: w,
        target: `${asFraction(num(p, "emeTarget"))} of TMPS`,
        counts: "Spend with suppliers classified as EME.",
        against: `${asFraction(num(p, "emeTarget"))} of TMPS.`,
        award: PROPORTIONAL,
      })),
    );
  }

  rows.push(
    ...maybe(num(p, "bo51MaxPts"), (w) => ({
      code: "pp.bo51",
      name: "Procurement from suppliers at least 51% black owned",
      weighting: w,
      target: `${asFraction(num(p, "bo51Target"))} of TMPS`,
      counts: "Spend with suppliers whose recorded black ownership is 51% or more.",
      against: `${asFraction(num(p, "bo51Target"))} of TMPS.`,
      award: PROPORTIONAL,
    })),
    ...maybe(num(p, "bwo30MaxPts"), (w) => ({
      code: "pp.bwo30",
      name: "Procurement from suppliers at least 30% black women owned",
      weighting: w,
      target: `${asFraction(num(p, "bwo30Target"))} of TMPS`,
      counts: "Spend with suppliers whose recorded black-women ownership is 30% or more.",
      against: `${asFraction(num(p, "bwo30Target"))} of TMPS.`,
      award: PROPORTIONAL,
    })),
  );

  if (!isTransportLarge) {
    rows.push(
      ...maybe(num(p, "dgMaxPts"), (w) => ({
        code: "pp.dg",
        name: "Procurement from designated group suppliers",
        weighting: w,
        target: `${asFraction(num(p, "dgTarget"))} of TMPS`,
        counts:
          "Spend with suppliers either marked as designated-group, or at least 51% black owned with some youth or disabled ownership recorded.",
        against: `${asFraction(num(p, "dgTarget"))} of TMPS.`,
        award: PROPORTIONAL,
        bonus: true,
      })),
    );
  }

  const subMinPct = pc?.subMinimumPercent ?? 0;
  const subMinimum =
    pc?.hasSubMinimum && subMinPct > 0
      ? `${subMinPct}% of the element's ${pc?.maxPoints ?? 0} points — ${(
          ((pc?.maxPoints ?? 0) * subMinPct) /
          100
        ).toFixed(2)} points. Tested BEFORE the element total is capped, so bonus points can carry an entity over the sub-minimum.`
      : null;

  return {
    key: "preferentialProcurement",
    name: "Preferential Procurement",
    measures:
      "The proportion of Total Measured Procurement Spend placed with empowering and black-owned suppliers.",
    weighting: pc?.maxPoints ?? 0,
    subMinimum,
    rows,
    reading: [
      "Each supplier is read as: rand spend, B-BBEE level, black ownership %, black-women ownership %, enterprise classification (EME / QSE / large), and whether it is a foreign supplier.",
      "Suppliers marked as foreign are excluded from every indicator in this element.",
      "Every indicator's target is TMPS multiplied by that indicator's percentage. A supplier can and does count on several rows at once — a 51% black-owned EME counts on the all-suppliers, EME and 51%-black-owned rows.",
      "TMPS is read as a single figure for the entity. The supplier schedule's own total is not used as the denominator, and the two are allowed to differ — spend legitimately excluded by the Codes sits in a schedule without being in TMPS.",
    ],
    flags: [
      "A supplier with no B-BBEE level recorded (or a level outside 1 to 8) is excluded from the all-empowering-suppliers row, but is still counted on the ownership rows it qualifies for.",
      "SAFETY GUARD: if any single supplier's spend is more than twice the TMPS figure, the engine treats TMPS as missing and EVERY indicator in this element scores zero. This catches a misplaced or mis-scaled TMPS, but it means one bad row on a schedule can zero the whole element. A client seeing 0 on all procurement rows with a populated schedule is almost always hitting this guard.",
      "Where TMPS is zero or missing, every target is zero and every row scores zero rather than scoring full marks.",
    ],
  };
}

// ---------------------------------------------------------------------------
// Elements: Supplier Development, Enterprise Development, Socio-Economic
// ---------------------------------------------------------------------------

function esdLedger(cfg: SectorConfigView, which: "sd" | "ed"): PillarLedger | null {
  const e = cfg.targets?.esd;
  const key = which === "sd" ? "supplierDevelopment" : "enterpriseDevelopment";
  const pc = cfg.pillarConfigs?.[key];
  if (!pc || pc.maxPoints <= 0) return null;

  const pctField = which === "sd" ? "sdPercent" : "edPercent";
  const ptsField = which === "sd" ? "sdMaxPts" : "edMaxPts";
  const label = which === "sd" ? "Supplier Development" : "Enterprise Development";

  const rows: LedgerRow[] = [
    ...maybe(num(e, ptsField), (w) => ({
      code: `${which}.spend`,
      name: `${label} contributions`,
      weighting: w,
      target: `${asPercent(num(e, pctField))} of Net Profit After Tax`,
      counts:
        "Each contribution's rand value multiplied by the benefit factor for its contribution type, added up across all contributions classified to this element.",
      against: `${asPercent(num(e, pctField))} of NPAT.`,
      award: PROPORTIONAL,
    })),
  ];

  if (which === "ed") {
    rows.push(
      ...maybe(num(e, "edGraduationBonus"), (w) => ({
        code: "ed.graduation",
        name: "Graduation bonus",
        weighting: w,
        target: "At least one beneficiary graduated from supplier development to enterprise development",
        counts: "The graduation declaration captured for the assessment.",
        against: "That declaration being set.",
        award: ALL_OR_NOTHING,
        bonus: true,
      })),
      ...maybe(num(e, "edJobsBonus"), (w) => ({
        code: "ed.jobs",
        name: "Jobs created bonus",
        weighting: w,
        target: "At least one permanent job created at a beneficiary",
        counts: "The jobs-created declaration captured for the assessment.",
        against: "That declaration being set.",
        award: ALL_OR_NOTHING,
        bonus: true,
      })),
    );
  }

  const subMinPct = pc.subMinimumPercent ?? 0;
  const subMinimum =
    pc.hasSubMinimum && subMinPct > 0
      ? `${subMinPct}% of the element's ${pc.maxPoints} points — ${(
          (pc.maxPoints * subMinPct) /
          100
        ).toFixed(2)} points. Missing it discounts the entity by one level.`
      : null;

  return {
    key,
    name: label,
    measures:
      which === "sd"
        ? "Recognised contributions to the development of black-owned suppliers in the entity's own supply chain, as a proportion of NPAT."
        : "Recognised contributions to the development of black-owned enterprises outside the supply chain, as a proportion of NPAT.",
    weighting: pc.maxPoints,
    subMinimum,
    rows,
    reading: [
      "Each contribution is read as: beneficiary, contribution type, rand amount, and which element it is classified to.",
      "A contribution's recognised value is its amount multiplied by the benefit factor for its type — a grant and a direct cost carry 100%, a loan at prime a lower factor, a guarantee lower still.",
      "A contribution not classified to supplier development, enterprise development or socio-economic development is counted by NO element. It is neither scored nor silently moved to another element.",
      "NPAT is read from the financial data. Where NPAT is zero or a loss, a deemed NPAT is used instead: revenue multiplied by the industry norm for the sector, defaulting to 5.58% of revenue.",
    ],
    flags: [
      "A contribution whose type is not in the benefit-factor table is recognised at ZERO, not at 100%. The arithmetic is right, but the contribution disappears from the total — so a mis-typed row and an absent row look identical on the scorecard. The assessment records these unrecognised types separately, and they should be read alongside any disputed score.",
      "A loss-making entity is measured against a deemed NPAT derived from revenue, so a contribution target still exists even where there is no profit.",
    ],
  };
}

function sedLedger(cfg: SectorConfigView): PillarLedger | null {
  const s = cfg.targets?.sed;
  const pc = cfg.pillarConfigs?.socioEconomicDevelopment;
  if (!pc || pc.maxPoints <= 0) return null;

  return {
    key: "socioEconomicDevelopment",
    name: "Socio-Economic Development",
    measures:
      "Recognised contributions toward the socio-economic development of black beneficiaries, as a proportion of NPAT.",
    weighting: pc.maxPoints,
    subMinimum:
      pc.hasSubMinimum && pc.subMinimumPercent > 0
        ? `${pc.subMinimumPercent}% of the element's ${pc.maxPoints} points.`
        : null,
    rows: [
      ...maybe(num(s, "maxPts") ?? pc.maxPoints, (w) => ({
        code: "sed.spend",
        name: "Socio-economic development contributions",
        weighting: w,
        target: `${asPercent(num(s, "spendPercent"))} of Net Profit After Tax`,
        counts:
          "Each contribution's rand value multiplied by the benefit factor for its type, across all contributions classified to socio-economic development.",
        against: `${asPercent(num(s, "spendPercent"))} of NPAT.`,
        award: PROPORTIONAL,
      })),
    ],
    reading: [
      "Only contributions classified to socio-economic development are counted here.",
      "Benefit factors come from the socio-economic development factor table, which differs from the supplier and enterprise development tables.",
      "NPAT, or deemed NPAT for a loss-making entity, is the same figure used by supplier and enterprise development.",
    ],
    flags: [
      "This element carries no sub-minimum, so a zero here does not discount the entity's level — it only reduces the total.",
      "An unrecognised contribution type is recognised at zero and reported separately, as with the other contribution elements.",
    ],
  };
}

// ---------------------------------------------------------------------------
// YES initiative
// ---------------------------------------------------------------------------

function yesLedger(cfg: SectorConfigView): PillarLedger | null {
  const pc = cfg.pillarConfigs?.yesInitiative;
  if (!pc) return null;

  return {
    key: "yesInitiative",
    name: "Youth Employment Service (YES)",
    measures:
      "Whether the entity's YES placements and absorptions qualify it for a recognition-level improvement, and in one tier for bonus points.",
    weighting: pc.maxPoints,
    subMinimum: null,
    rows: [
      {
        code: "yes.tier1",
        name: "Tier 1 — two levels better",
        weighting: 0,
        target: "YES candidates at twice the headcount target, and at least 5% of them absorbed",
        counts:
          "Number of employees marked as YES candidates, and how many of those are marked as absorbed.",
        against: "Twice the YES headcount target, and a 5% absorption rate.",
        award: "Improves the recognition level by two. No points are added to the total.",
      },
      {
        code: "yes.tier2",
        name: "Tier 2 — one level better plus bonus points",
        weighting: 3,
        target: "Candidates at 1.5 times the headcount target, and at least 5% absorbed",
        counts: "As above.",
        against: "1.5 times the headcount target, and a 5% absorption rate.",
        award: "Improves the recognition level by one AND adds 3 points to the scorecard total.",
      },
      {
        code: "yes.tier3",
        name: "Tier 3 — one level better",
        weighting: 0,
        target: "Candidates at the headcount target, and at least 2.5% absorbed",
        counts: "As above.",
        against: "The headcount target, and a 2.5% absorption rate.",
        award: "Improves the recognition level by one.",
      },
      {
        code: "yes.target",
        name: "The YES headcount target itself",
        weighting: 0,
        target:
          "Under 500 employees: 2.5% of headcount, minimum 1. 500 to 1,000: 1.5%, minimum 8. Over 1,000: 1%, minimum 15.",
        counts: "The entity's employee headcount.",
        against: "The banded percentages above, rounded up.",
        award: "Sets the target the three tiers are measured against.",
      },
    ],
    reading: [
      "YES candidates are read from the training schedule — lines marked as a YES employee — not from the employee schedule.",
      "The headcount used for the target is the number of employees on the employee schedule.",
      "The absorption rate is absorbed YES candidates ÷ all YES candidates.",
    ],
    flags: [
      "REVIEW: the tiers are tested in order and the first match wins. Only tier 2 carries points; tiers 1 and 3 change the level without changing the total, so a scorecard can show a better level than its point total implies.",
      "A YES level improvement is applied AFTER any sub-minimum discount, so an entity that failed a sub-minimum can be lifted back past the discount by YES.",
    ],
  };
}

// ---------------------------------------------------------------------------
// Construction: the engine scores from per-indicator rows, not target buckets
// ---------------------------------------------------------------------------

const CONSTRUCTION_ELEMENT_NAMES: Record<string, string[]> = {
  ownership: ["Ownership"],
  managementControl: ["Management Control", "Management and Control"],
  employmentEquity: ["Employment Equity"],
  skillsDevelopment: ["Skills Development"],
  preferentialProcurement: ["Preferential Procurement"],
  supplierDevelopment: ["Supplier Development"],
  enterpriseDevelopment: ["Enterprise Development"],
  socioEconomicDevelopment: ["Socio-Economic Development", "Socio Economic Development"],
};

function constructionLedger(
  cfg: SectorConfigView,
  pillarKey: string,
  pillarName: string,
): PillarLedger {
  const pc = cfg.pillarConfigs?.[pillarKey];
  const wanted = CONSTRUCTION_ELEMENT_NAMES[pillarKey] ?? [];
  const matching = (cfg.indicators ?? []).filter((i) =>
    wanted.some((n) => (i.element ?? "").toLowerCase() === n.toLowerCase()),
  );

  return {
    key: pillarKey,
    name: pillarName,
    measures: "Scored from the Construction Sector Code's own indicator matrix.",
    weighting: pc?.maxPoints ?? 0,
    subMinimum:
      pc?.hasSubMinimum && pc.subMinimumPercent > 0
        ? `${pc.subMinimumPercent}% of the element's ${pc.maxPoints} points.`
        : null,
    rows: matching.map((i) => ({
      code: `con.${i.code}`,
      name: i.name,
      weighting: i.weight,
      target: `${i.target}${i.targetUnit ? ` ${i.targetUnit}` : ""}`,
      counts: i.calculation,
      against: `${i.target}${i.targetUnit ? ` ${i.targetUnit}` : ""}`,
      award: PROPORTIONAL,
      bonus: i.category === "bonus",
    })),
    reading: [
      "The Construction Sector Code's indicators do not map onto the generic target structure, so this sector is scored from its own indicator matrix.",
    ],
    flags: matching.length
      ? []
      : [
          "No indicator rows are published for this element on this scorecard. Confirm whether the element applies to this scorecard type.",
        ],
    empty: matching.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Assembling the whole scorecard
// ---------------------------------------------------------------------------

const PILLAR_ORDER: Array<{ key: string; name: string }> = [
  { key: "ownership", name: "Ownership" },
  { key: "managementControl", name: "Management Control" },
  { key: "employmentEquity", name: "Employment Equity" },
  { key: "skillsDevelopment", name: "Skills Development" },
  { key: "preferentialProcurement", name: "Preferential Procurement" },
  { key: "supplierDevelopment", name: "Supplier Development" },
  { key: "enterpriseDevelopment", name: "Enterprise Development" },
  { key: "socioEconomicDevelopment", name: "Socio-Economic Development" },
  { key: "yesInitiative", name: "Youth Employment Service" },
];

export function buildLedger(cfg: SectorConfigView): PillarLedger[] {
  const isConstruction = cfg.code === "CONSTRUCTION";
  const out: PillarLedger[] = [];

  for (const { key, name } of PILLAR_ORDER) {
    const pc = cfg.pillarConfigs?.[key];
    if (!pc) continue;
    if (key !== "yesInitiative" && (pc.maxPoints ?? 0) <= 0) continue;

    if (isConstruction && key !== "yesInitiative") {
      out.push(constructionLedger(cfg, key, name));
      continue;
    }

    switch (key) {
      case "ownership":
        out.push(ownershipLedger(cfg));
        break;
      case "managementControl":
        out.push(managementLedger(cfg));
        break;
      case "employmentEquity": {
        const ee = employmentEquityLedger(cfg);
        if (ee) out.push(ee);
        break;
      }
      case "skillsDevelopment":
        out.push(skillsLedger(cfg));
        break;
      case "preferentialProcurement":
        out.push(procurementLedger(cfg));
        break;
      case "supplierDevelopment": {
        const sd = esdLedger(cfg, "sd");
        if (sd) out.push(sd);
        break;
      }
      case "enterpriseDevelopment": {
        const ed = esdLedger(cfg, "ed");
        if (ed) out.push(ed);
        break;
      }
      case "socioEconomicDevelopment": {
        const sed = sedLedger(cfg);
        if (sed) out.push(sed);
        break;
      }
      case "yesInitiative": {
        const yes = yesLedger(cfg);
        if (yes) out.push(yes);
        break;
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// How the scorecard total becomes a level
// ---------------------------------------------------------------------------

export interface LevelRules {
  total: number;
  thresholds: Array<{ level: number; minPoints: number; recognition: number }>;
  notes: string[];
  electiveNote: string | null;
}

export function levelRules(cfg: SectorConfigView): LevelRules {
  const elective = Object.values(cfg.pillarConfigs ?? {}).some((p) => p?.chooseOneGroup);
  const isTransportQse = cfg.code === "TRANSPORT" && cfg.type === "QSE";

  const notes = [
    "The scorecard total is the sum of every element's score, plus any YES tier-2 bonus points. Each element is capped at its own weighting before it is added.",
    "The total is compared against the level table from the top down: the entity takes the highest level whose minimum it reaches.",
    "A total below the lowest threshold is non-compliant and carries no recognition.",
    "SUB-MINIMUM DISCOUNT: if the entity misses the sub-minimum on ANY of Ownership (net value), Skills Development, Preferential Procurement, Supplier Development or Enterprise Development, its level is made one worse, to a floor of Level 8. Management Control, Employment Equity and Socio-Economic Development sub-minimums do not trigger the discount.",
    "A YES tier improvement is applied after that discount and can reverse it.",
    "Where an element has a sub-minimum it is tested on that element's score — and for Ownership, on the net value indicator alone rather than on the element total.",
  ];

  if (isTransportQse) {
    notes.push(
      "Transport QSE is measured on any FOUR of its seven elements. Each elected element contributes 25 points to the denominator, so the target is always 100 — even though individual elements carry bonus points that take their own maximum above 25. This is why a Transport QSE certificate can legitimately read 102 out of 100.",
    );
  }

  return {
    total: cfg.totalPoints,
    thresholds: [...(cfg.levelThresholds ?? [])].sort((a, b) => b.minPoints - a.minPoints),
    notes,
    electiveNote: elective
      ? "This scorecard has elective elements: only the elected ones count toward the score, and the others are excluded from both the score and the denominator."
      : null,
  };
}

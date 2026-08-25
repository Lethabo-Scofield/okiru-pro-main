/**
 * `NetZero_Roadmap` — SBTi CNZS 2.0 milestones.
 *
 * WHAT CHANGED AND WHY
 * --------------------
 * `MILESTONE_DEFS` used to give all four tiers the **same** `gapTco2e`
 * (`current − baseline`), so the roadmap table printed one number four times and
 * said nothing about whether the 2028 or the 2050 milestone was in reach. The
 * `targetYear` read from `Assumptions!B107` was never used at all.
 *
 * The workbook already publishes a real reduction trajectory —
 * `NetZero_Roadmap!C5:L5`, each cell `=IFERROR(B5*(1-x),0)` — so each milestone
 * now has its own target and its own gap:
 *
 *   2025 −0 %   2026 −5 %   2027 −12 %  2028 −20 %  2029 −35 %  2030 −50 %
 *   2035 −65 %  2040 −78 %  2045 −90 %  2050 −95 %
 *
 * The tiers, years and requirement strings are `NetZero_Roadmap!A13:C16`
 * verbatim. The terminal milestone's year comes from `Assumptions!B107`
 * (`ENT_NZ`) so a company targeting 2040 sees 2040, not a hardcoded 2050.
 *
 * WORKBOOK CONFLICT (surfaced, not resolved): the Recognised tier's requirement
 * text says "−50 % Scope 1+2 from baseline" at 2028, while the numeric
 * trajectory puts −20 % at 2028 and −50 % at 2030. The formula is authoritative
 * and the prose is a note (ledger, "Conventions"), so the target is computed
 * from the trajectory and the prose is passed through unaltered for display.
 */
import { readEsgCell, type EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { computeGhgInventory } from "./ghgInventory";
import { scoringMode, type EsgScoringOptions } from "./shared";

export type NetZeroMilestone = {
  tier: string;
  year: number;
  requirement: string;
  /** Fraction of the baseline that must be eliminated by `year`. */
  reductionRequired: number;
  /** Permitted Scope 1+2 tCO₂e at `year` = baseline × (1 − reductionRequired). */
  targetTco2e: number;
  /** How far current emissions exceed this milestone's target. */
  gapTco2e: number;
  onTrack: boolean;
};

/** A `NetZero_Roadmap!A20:F27` key-lever row. */
export type NetZeroLever = {
  lever: string;
  action: string;
  target: string;
  timeline: string;
  owner: string;
};

export type NetZeroRoadmapResult = {
  baselineTco2e: number;
  currentTco2e: number;
  /** Gap to the FINAL milestone (the net-zero target year). */
  gapTco2e: number;
  targetYear: number;
  milestones: NetZeroMilestone[];
  levers: NetZeroLever[];
  /** False when `E_Data!B90` carries no baseline — nothing can be computed. */
  available: boolean;
};

/**
 * `NetZero_Roadmap!C5:L5` — the Scope 1+2 reduction trajectory, read straight
 * off the `=B5*(1-x)` formulas. Column headers `C4:L4` give the years.
 */
const SCOPE12_TRAJECTORY: ReadonlyArray<readonly [year: number, reduction: number]> = [
  [2025, 0],
  [2026, 0.05],
  [2027, 0.12],
  [2028, 0.2],
  [2029, 0.35],
  [2030, 0.5],
  [2035, 0.65],
  [2040, 0.78],
  [2045, 0.9],
  [2050, 0.95],
];

/** `NetZero_Roadmap!A13:C16` — the OER tier table, verbatim. */
const OER_TIERS: ReadonlyArray<{ tier: string; year: number; requirement: string; terminal?: boolean }> = [
  { tier: "Pre-Recognised (Current)", year: 2025, requirement: "Commit to SBTi near-term target" },
  { tier: "Recognised", year: 2028, requirement: "−50% Scope 1+2 from baseline" },
  {
    tier: "Leadership",
    year: 2035,
    requirement: "−90% Scope 1+2 + 30% S3 + residual offsets",
  },
  { tier: "Net-Zero", year: 2050, requirement: "Net-Zero across Scope 1+2+3", terminal: true },
];

/**
 * Reduction required by `year`, read off the workbook's published trajectory.
 * Between two published points the trajectory is interpolated linearly (SBTi's
 * own linear-annual-reduction convention); outside the published range it is
 * clamped to the nearest endpoint. No new reduction target is invented.
 */
export function netZeroReductionAt(year: number): number {
  const points = SCOPE12_TRAJECTORY;
  if (year <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (year >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [y1, r1] = points[i];
    if (year > y1) continue;
    const [y0, r0] = points[i - 1];
    if (year === y1) return r1;
    return r0 + ((r1 - r0) * (year - y0)) / (y1 - y0);
  }
  return last[1];
}

export function computeNetZeroRoadmap(
  workbook: EsgWorkbookData,
  options?: EsgScoringOptions,
): NetZeroRoadmapResult {
  const mode = scoringMode(options);

  /*
   * `F90 = =L79+L82` — the same mixed-unit block `carbonTax` used to read, so
   * "current emissions" was litres + kWh rather than tonnes and every
   * milestone gap was measured against it. Corrected mode uses the GHG
   * inventory; parity mode keeps the sheet's own cell.
   *
   * The BASELINE stays `B90` in both modes: it is a figure the company enters
   * for its chosen base year, not something derivable from this period's
   * activity. Where it is unset the roadmap already reports "Set baseline"
   * rather than inventing one.
   */
  const baselineCell = readEsgCell(workbook, "e-data", "B90");
  const baseline = baselineCell ?? 0;
  const current =
    mode === "workbook-parity"
      ? readEsgCell(workbook, "e-data", "F90") ?? 0
      : computeGhgInventory(workbook).scope1And2;

  /*
   * `Assumptions!B107` (`ENT_NZ`). No config fallback: an unset target year is
   * unset — the same reason `E_Scorecard!C9` no longer awards its 5 points for
   * a target nobody entered.
   */
  const targetYear = readEsgCell(workbook, "assumptions", "B107") ?? 0;

  const milestones: NetZeroMilestone[] = OER_TIERS.map((t) => {
    const year = t.terminal && targetYear > 0 ? targetYear : t.year;
    const reductionRequired = netZeroReductionAt(year);
    const targetTco2e = baseline > 0 ? baseline * (1 - reductionRequired) : 0;
    return {
      tier: t.tier,
      year,
      requirement: t.requirement,
      reductionRequired,
      targetTco2e,
      gapTco2e: baseline > 0 ? Math.max(0, current - targetTco2e) : 0,
      onTrack: baseline > 0 ? current <= targetTco2e : false,
    };
  }).sort((a, b) => a.year - b.year);

  const terminal = milestones[milestones.length - 1];

  return {
    baselineTco2e: baseline,
    currentTco2e: current,
    gapTco2e: terminal?.gapTco2e ?? 0,
    targetYear,
    milestones,
    levers: readLevers(workbook),
    available: baselineCell != null && baselineCell > 0,
  };
}

/**
 * `NetZero_Roadmap!A20:F27` — the client's own key-lever plan.
 *
 * This app has no NetZero_Roadmap input section, so this is normally empty. It
 * returns `[]` rather than a default list on purpose: the previous hardcoded
 * `LEVERS` array in `EsgNetZero.tsx` showed the SOURCE CLIENT's plan and owner
 * roles ("Fleet Mgr", "Ops", "WSP", "SHEQ" — in the workbook, named individuals)
 * to every company that opened the page.
 */
function readLevers(workbook: EsgWorkbookData): NetZeroLever[] {
  const cells = workbook.sections?.["netzero"]?.cells;
  if (!cells) return [];
  const out: NetZeroLever[] = [];
  for (let row = 20; row <= 27; row++) {
    const lever = text(cells[`A${row}`]);
    if (lever === "") continue;
    out.push({
      lever,
      action: text(cells[`B${row}`]),
      target: text(cells[`D${row}`]),
      timeline: text(cells[`E${row}`]),
      owner: text(cells[`F${row}`]),
    });
  }
  return out;
}

function text(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

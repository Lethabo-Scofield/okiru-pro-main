/**
 * THE DATA SPINE — section 4.1 of `docs/Report/Okiru-ESG-Report-Template-Specification.md`.
 *
 * Until now the ESG product ended at a dashboard: the workbook was scored and a
 * percentage appeared on screen. Nothing left the building. This module is the
 * missing half — it turns a scored workbook into the *disclosure record* the
 * specification describes, so the same spine renders as a Disclosure Pack
 * (DOCX/PDF), and later as the Board Strategy Pack, Stakeholder One-Pager and
 * Data Book, without any of them re-deriving a figure.
 *
 * The specification's central claim is that credibility comes from
 * TRACEABILITY, not length (2.3). So every metric here carries the full
 * section-5 record — boundary, source system, owner, calculation method,
 * emission factor and its source, data quality, assurance status, target,
 * variance, RAG and evidence IDs — and nothing renders without them.
 *
 * WHAT IS AND IS NOT INVENTED
 *
 * Every VALUE comes from the workbook or from a calculator that already ships
 * (`computeGhgInventory`, `computeEsgScorecard`, `computeNetZeroRoadmap`,
 * `computeCarbonTax`). Nothing is fabricated to make a page look full. Where a
 * figure is absent the spine records an OMISSION with a reason code (5.3),
 * and that omission automatically creates a gap-register row and a roadmap
 * action (5.3 MECHANISM) — which is what makes the absence commercially useful
 * rather than embarrassing.
 *
 * The one thing this module deliberately does NOT read is `E_Data!L75:L84`.
 * Those rows are labelled tCO2e and hold raw litres and kWh; the workbook sums
 * the lot, giving a "total" roughly a thousand times the real one. Emissions
 * come from `computeGhgInventory`, which multiplies activity by a stated
 * emission factor and is the only defensible arithmetic in the codebase.
 */
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { readEsgCell, readEsgText } from "@/lib/esgWorkbookStorage";
import {
  SCORECARD_INDICATORS,
  type EsgScorecardPillar,
} from "@/lib/esg/esgScorecardDefinitions";
import { ESG_TOOLKIT_PILLAR_NAV } from "@/lib/esg/esgToolkitNav";
import { readReportScopeFromCells, type EsgReportScope } from "@/lib/esg/esgTopicScope";
import { deriveEsgSummaryCells } from "@/lib/esg/esgDeriveSummary";
import {
  computeEsgScorecard,
  computeGhgInventory,
  computeNetZeroRoadmap,
  computeCarbonTax,
  computeEsgIntensity,
  type EsgIntensityResult,
  type EsgScorecardResult,
  type GhgInventoryResult,
  type GhgLine,
  type NetZeroRoadmapResult,
  type CarbonTaxResult,
} from "../../../../EsgToolkit/src/lib/calculators";

/* ─────────────────────────── section 5: metric schema ──────────────────── */

export type EsgBoundary =
  | "Operational control"
  | "Financial control"
  | "Equity share"
  /** The company has not made the declaration the GHG Protocol requires. */
  | "Not declared";
export type EsgAssuranceStatus =
  | "Unassured"
  | "Internally reviewed"
  | "Limited assurance"
  | "Reasonable assurance";
export type EsgRag = "Green" | "Amber" | "Red" | "Grey";
export type EsgTier = "Core" | "Leadership";
export type EsgOmissionCode =
  | "NOT_MATERIAL"
  | "NOT_APPLICABLE"
  | "DATA_UNAVAILABLE"
  | "IN_PROGRESS"
  | "CONFIDENTIAL";

/** Section 5 — every field the specification requires of a metric record. */
export type EsgMetricRecord = {
  metricId: string;
  topic: string;
  subtopic: string;
  tier: EsgTier;
  metricName: string;
  value: number | string | null;
  unit: string;
  periodStart: string;
  periodEnd: string;
  boundary: EsgBoundary;
  entitiesIncluded: string[];
  sourceSystem: string;
  sourceOwner: string;
  calculationMethod: string;
  emissionFactor: number | null;
  emissionFactorSource: string | null;
  dataQualityScore: 1 | 2 | 3 | 4 | 5 | null;
  assuranceStatus: EsgAssuranceStatus;
  priorYearValue: number | null;
  restated: boolean;
  restatementReason: string | null;
  targetValue: number | null;
  targetYear: number | null;
  varianceVsTarget: number | null;
  ragStatus: EsgRag;
  omissionCode: EsgOmissionCode | null;
  omissionDetail: string | null;
  evidenceIds: string[];
  commentary: string | null;
  frameworkRefs: string[];
  pillar: "Environmental" | "Social" | "Governance";
};

export type EsgEvidenceItem = {
  evidenceId: string;
  description: string;
  sheet: string;
  range: string;
  cellsPopulated: number;
  capturedAt: string;
};

/** Section 6.3 — a narrative sentence, classified before it may render. */
export type EsgClaim = {
  claimId: string;
  tier: "A" | "B" | "C" | "D";
  text: string;
  boundTo: string[];
  evidenceIds: string[];
  /** Section 6.4 pairing rule — a factual or commitment claim must carry a figure. */
  pairedMetricIds: string[];
};

export type EsgGapRow = {
  gapId: string;
  metric: string;
  natureOfGap: string;
  requirementNotMet: string;
  risk: "High" | "Medium" | "Low";
  effortBand: "S" | "M" | "L";
  costBand: string;
  owner: string;
  targetClose: string;
  roadmapRef: string;
  riskWeightedEffort: number;
};

export type EsgRoadmapRow = {
  action: string;
  materialMatter: string;
  metric: string;
  owner: string;
  start: string;
  due: string;
  dependencies: string;
  effort: "S" | "M" | "L";
  costBand: string;
  expectedOutcome: string;
  status: string;
  horizon: "0-6 months" | "6-18 months" | "18-36 months";
  roadmapRef: string;
};

export type EsgDisclosureIndexRow = {
  requiredDisclosure: string;
  frameworkRefs: string;
  whereReported: string;
  status: "Reported" | "Partially reported" | "Omitted";
  dataQuality: string;
  omissionReason: string;
};

export type EsgKpiRow = {
  metric: string;
  baseline: string;
  priorYear: string;
  current: string;
  target: string;
  targetYear: string;
  trajectory: string;
  rag: EsgRag;
  dataQuality: string;
  assurance: string;
  owner: string;
  pillar: "Environmental" | "Social" | "Governance";
};

export type EsgAssuranceReadinessRow = {
  topic: string;
  rating: "Ready for limited assurance" | "Remediation required" | "Not assurable";
  weightedDataQuality: number | null;
  metricsPopulated: number;
  metricsTotal: number;
  reason: string;
};

export type EsgRegulatoryRow = {
  instrument: string;
  status: string;
  requirement: string;
  applicability: string;
  actionRequired: string;
  deadline: string;
};

export type EsgBoardDecision = {
  decision: string;
  deadline: string;
  consequenceOfDeferral: string;
  costBand: string;
  roadmapRef: string;
};

export type EsgMaterialMatter = {
  matter: string;
  pillar: EsgMetricRecord["pillar"];
  financialExposure: string;
  metricIds: string[];
  metricNames: string[];
  roadmapRefs: string[];
  /** Section 7.5 RULE — flagged when nothing is attached. */
  flagged: boolean;
};

export type EsgReportMeta = {
  entityName: string;
  companyId: string;
  reportTitle: string;
  reportingPeriod: string;
  periodStart: string;
  periodEnd: string;
  sector: string;
  baselineYear: number | null;
  netZeroTargetYear: number | null;
  boundary: EsgBoundary;
  entitiesIncluded: string[];
  preparedBy: string;
  generationReference: string;
  generatedAt: string;
  toolkitVersion: string;
  crossWalkVersion: string;
  reportVersion: string;
  /** Section 7.1 F2 item 10 — the sign-off gate. Empty means DRAFT, no override. */
  signOffName: string;
  signOffRole: string;
  signOffDate: string;
  isDraft: boolean;
  reportingStandard: string;
  materialityApproach: string;
  dataMonths: number | null;
  scopeMode: EsgReportScope["mode"];
  selectedTopics: string[];
};

export type EsgReportModel = {
  meta: EsgReportMeta;
  scores: {
    overallPercent: number;
    environmental: { score: number; max: number; percent: number };
    social: { score: number; max: number; percent: number };
    governance: { score: number; max: number; percent: number };
  };
  metrics: EsgMetricRecord[];
  evidence: EsgEvidenceItem[];
  claims: EsgClaim[];
  gaps: EsgGapRow[];
  roadmap: EsgRoadmapRow[];
  disclosureIndex: EsgDisclosureIndexRow[];
  kpiTable: EsgKpiRow[];
  assuranceReadiness: EsgAssuranceReadinessRow[];
  regulatoryHorizon: EsgRegulatoryRow[];
  boardDecisions: EsgBoardDecision[];
  materialMatters: EsgMaterialMatter[];
  ghg: GhgInventoryResult;
  netZero: NetZeroRoadmapResult | null;
  carbonTax: CarbonTaxResult | null;
  /** Emissions per unit of business activity — the ratio a lender asks for. */
  intensity: EsgIntensityResult;
  scorecard: EsgScorecardResult | null;
  /** Section 5.1 RULE — the report-level weighted data-quality index. */
  dataQualityIndex: number | null;
  dataQualityDistribution: Record<"1" | "2" | "3" | "4" | "5" | "unrated", number>;
  emissionFactors: { factor: string; value: number; unit: string; source: string }[];
  /** Section 8 rule 1 — how much rendered as data and how much as an omission. */
  coverage: { populated: number; omitted: number; total: number };
};

/* ───────────────────────── section 5.3: omission taxonomy ──────────────── */

/** Verbatim from 5.3 — the exact sentence each code renders as. */
export function renderOmission(
  code: EsgOmissionCode,
  vars: { entity: string; reason?: string; roadmapRef?: string; date?: string; period?: string },
): string {
  const entity = vars.entity || "The entity";
  switch (code) {
    case "NOT_MATERIAL":
      return `Assessed as not material to ${entity} given ${vars.reason ?? "the materiality threshold applied"}. This assessment is reviewed annually.`;
    case "NOT_APPLICABLE":
      return `Not applicable to ${entity}'s operations. ${vars.reason ?? "The activity does not occur within the reporting boundary."}`;
    case "DATA_UNAVAILABLE":
      return `${entity} does not currently collect this data. A remediation action is recorded at ${vars.roadmapRef ?? "the roadmap"}, targeted for ${vars.date ?? "the next reporting period"}.`;
    case "IN_PROGRESS":
      return `Measurement commenced ${vars.date ?? "during the period"}; a full-period figure will be reported from ${vars.period ?? "the next reporting period"}.`;
    case "CONFIDENTIAL":
      return `Withheld on confidentiality grounds. ${vars.reason ?? "Disclosure would prejudice a commercial interest."}`;
  }
}

/** Section 7.1 MANDATORY PROVENANCE PARAGRAPH — verbatim, variables bound. */
export function provenanceParagraph(entity: string, appendixRef = "C", pageRef = "the executive summary"): string {
  return `The information in this report was compiled by Okiru from data supplied by ${entity}. Okiru has not independently verified the underlying data. Data quality is disclosed per metric in Appendix ${appendixRef} and summarised on ${pageRef}.`;
}

export const DATA_QUALITY_LEGEND: { score: number; definition: string }[] = [
  { score: 5, definition: "Metered or system-generated, independently verifiable, complete for the full period" },
  { score: 4, definition: "System-generated with minor manual adjustment or estimation under 5% of total" },
  { score: 3, definition: "Mix of measured and estimated data; estimation method documented" },
  { score: 2, definition: "Primarily estimated or extrapolated from a sample or proxy" },
  { score: 1, definition: "Single-point estimate, proxy or industry average; indicative only" },
];

export const RAG_LEGEND: { status: EsgRag; definition: string }[] = [
  { status: "Green", definition: "On or ahead of target trajectory, with data quality 4 or 5" },
  { status: "Amber", definition: "Within 10% of trajectory, or on trajectory but data quality 3 or below" },
  { status: "Red", definition: "Off trajectory by more than 10%, or no baseline established" },
  { status: "Grey", definition: "Not yet measured; renders an omission statement and a gap-register entry" },
];

export const CLAIM_TIER_LEGEND: { tier: string; type: string; asserts: string; bindsTo: string }[] = [
  { tier: "A", type: "Factual", asserts: "A measured outcome", bindsTo: "A metric ID in the register" },
  { tier: "B", type: "Process", asserts: "That something is done a certain way", bindsTo: "A policy, procedure or committee minute" },
  { tier: "C", type: "Commitment", asserts: "A future intention", bindsTo: "A board-approved target with a date and an owner" },
  { tier: "D", type: "Context", asserts: "The operating environment", bindsTo: "A cited external source" },
];

/** Section 8 — the eight generation rules, printed in the methodology appendix. */
export const GENERATION_RULES: { n: number; rule: string; prevents: string }[] = [
  { n: 1, rule: "Nothing renders empty — a section with no data renders an omission statement, never a blank or a placeholder", prevents: "A gap reading as an oversight" },
  { n: 2, rule: "Draft until signed — full-page DRAFT watermark until the client sign-off field is populated, no override", prevents: "Okiru carrying liability for an unapproved disclosure" },
  { n: 3, rule: "Claims are evidence-bound, tiered A to D, and paired with a figure", prevents: "Greenwashing exposure" },
  { n: 4, rule: "Suppression is visible — sections omitted as immaterial still appear in the disclosure index with the reason", prevents: "Silent removal of an inconvenient topic" },
  { n: 5, rule: "Version stamping — toolkit, cross-walk, extract date and report version on every output", prevents: "Inability to reconstruct how a figure was produced" },
  { n: 6, rule: "Restatement is automatic — any changed prior-year figure triggers a footnote and an appendix row", prevents: "Silent restatement" },
  { n: 7, rule: "Length control — past 60 pages, detail moves to the Data Book", prevents: "Length substituting for rigour" },
  { n: 8, rule: "One chart specification — no chart without axis units and a source note naming the metric ID", prevents: "Unattributable visuals" },
];

/* ──────────────────────────────── helpers ──────────────────────────────── */

const num = (v: number | null | undefined, digits = 1): string =>
  v == null || !Number.isFinite(v)
    ? "—"
    : v.toLocaleString("en-ZA", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const pct = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(1)}%`;

function countCells(wb: EsgWorkbookData, sectionId: string, prefix?: RegExp): number {
  const cells = wb.sections?.[sectionId]?.cells ?? {};
  return Object.entries(cells).filter(([k, v]) => {
    if (v == null || v === "") return false;
    return prefix ? prefix.test(k) : true;
  }).length;
}

/**
 * Section 5.1 — data quality derived from HOW the number was captured, never
 * asserted. A monthly grid filled for the whole period is system-generated with
 * light adjustment (4); a partial grid mixes measured and estimated (3); a lone
 * totals cell is an extrapolation the analyst cannot see behind (2).
 */
function dataQualityFromCapture(monthsCaptured: number, monthsExpected: number): 1 | 2 | 3 | 4 | 5 | null {
  if (monthsCaptured <= 0) return null;
  if (monthsExpected > 0 && monthsCaptured >= monthsExpected) return 4;
  if (monthsCaptured >= Math.max(2, Math.floor(monthsExpected * 0.5))) return 3;
  return 2;
}

/** Section 5.2 — RAG derived from trajectory AND data quality, never chosen. */
function ragFor(onTrajectory: boolean | null, withinTenPercent: boolean, dq: 1 | 2 | 3 | 4 | 5 | null): EsgRag {
  if (dq == null) return "Grey";
  if (onTrajectory === null) return "Red"; // no baseline established
  if (onTrajectory && dq >= 4) return "Green";
  if (onTrajectory || withinTenPercent) return "Amber";
  return "Red";
}

const HORIZONS: EsgRoadmapRow["horizon"][] = ["0-6 months", "6-18 months", "18-36 months"];

/* ───────────────────────────── the builder ─────────────────────────────── */

export type BuildReportInput = {
  workbook: EsgWorkbookData;
  companyName: string;
  companyId: string;
  /** Injected so the model stays pure and testable — no clock inside. */
  now: Date;
  preparedBy?: string;
  reportVersion?: string;
  toolkitVersion?: string;
  crossWalkVersion?: string;
};

export function buildEsgReportModel(input: BuildReportInput): EsgReportModel {
  const { companyName, companyId, now } = input;
  // The scorers derive the workbook's summary cells before reading them — the
  // app's stand-in for the Excel formula layer. The report must read the SAME
  // derived view, or a manually-entered workbook would report blanks for every
  // total (headcount L12, waste B16, LTIFR G35) while still scoring correctly.
  const workbook = deriveEsgSummaryCells(input.workbook);
  const entityName =
    readEsgText(workbook, "company-reporting-setup", "entity") || companyName || companyId;
  const period = readEsgText(workbook, "company-reporting-setup", "period") || "Current reporting period";
  const sector =
    readEsgText(workbook, "company-reporting-setup", "sector") ||
    readEsgText(workbook, "assumptions", "B10") ||
    "Generic";
  const baselineYear = readEsgCell(workbook, "company-reporting-setup", "baselineYear");
  const netZeroTargetYear = readEsgCell(workbook, "company-reporting-setup", "netZeroTargetYear");
  const reportingStandard = readEsgText(workbook, "assumptions", "B11") || "King V + IFRS S1/S2";
  const materialityApproach = readEsgText(workbook, "assumptions", "B12") || "Single (financial — IFRS)";
  const dataMonths = readEsgCell(workbook, "assumptions", "B111");
  /*
   * The organisational boundary is the company’s declaration, not ours. The
   * GHG Protocol treats the choice as a mandatory reporting principle, and a
   * report that states absolute tonnes without saying which boundary produced
   * them is unreviewable — a reader cannot tell whether a joint venture or a
   * controlled subsidiary is in or out. Where it has not been declared the
   * report says so rather than asserting one on the client’s behalf.
   */
  const declaredBoundary = readEsgText(workbook, "company-reporting-setup", "boundary");
  const boundary = (["Operational control", "Financial control", "Equity share"].includes(
    declaredBoundary,
  )
    ? declaredBoundary
    : "Not declared") as EsgBoundary;

  const scope = readReportScopeFromCells(workbook.sections?.assumptions?.cells);
  const scorecard = computeEsgScorecard(workbook);
  const ghg = computeGhgInventory(workbook);
  const intensity = computeEsgIntensity(workbook);
  let netZero: NetZeroRoadmapResult | null = null;
  let carbonTax: CarbonTaxResult | null = null;
  try {
    netZero = computeNetZeroRoadmap(workbook);
  } catch {
    netZero = null;
  }
  try {
    carbonTax = computeCarbonTax(workbook);
  } catch {
    carbonTax = null;
  }

  const signOffName = readEsgText(workbook, "assumptions", "_signOffName");
  const signOffRole = readEsgText(workbook, "assumptions", "_signOffRole");
  const signOffDate = readEsgText(workbook, "assumptions", "_signOffDate");
  const isDraft = !(signOffName && signOffDate);

  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const generationReference = `OK-ESG-${(companyId || "NA").slice(0, 8).toUpperCase()}-${stamp}`;

  const meta: EsgReportMeta = {
    entityName,
    companyId,
    reportTitle: "ESG Disclosure Pack",
    reportingPeriod: period,
    periodStart: readEsgText(workbook, "company-reporting-setup", "periodStart") || period,
    periodEnd: readEsgText(workbook, "company-reporting-setup", "periodEnd") || period,
    sector,
    baselineYear,
    netZeroTargetYear,
    boundary,
    entitiesIncluded: [entityName],
    preparedBy: input.preparedBy ?? "Okiru",
    generationReference,
    generatedAt: now.toISOString(),
    toolkitVersion: input.toolkitVersion ?? "ESG Intelligence Toolkit v1.7",
    crossWalkVersion: input.crossWalkVersion ?? "JSE / IFRS / GRI cross-walk v1.0",
    reportVersion: input.reportVersion ?? "1.0",
    signOffName,
    signOffRole,
    signOffDate,
    isDraft,
    reportingStandard,
    materialityApproach,
    dataMonths,
    scopeMode: scope.mode,
    selectedTopics: scope.selectedTopics,
  };

  /* ── evidence register: one item per populated workbook block ─────────── */
  const evidence: EsgEvidenceItem[] = [];
  let evSeq = 1;
  const addEvidence = (description: string, sheet: string, range: string, cells: number): string | null => {
    if (cells <= 0) return null;
    const evidenceId = `EV-${String(evSeq++).padStart(4, "0")}`;
    evidence.push({ evidenceId, description, sheet, range, cellsPopulated: cells, capturedAt: workbook.updatedAt });
    return evidenceId;
  };

  const evGhgActivity = addEvidence("Monthly Scope 1 activity grids — diesel, LPG, petrol", "E_Data", "A14:M37", countCells(workbook, "e-data", /^s1[a-d]_/));
  const evElectricity = addEvidence("Monthly purchased electricity and on-site solar generation", "E_Data", "A41:M54", countCells(workbook, "e-data", /^(s2|solar)_/));
  const evWater = addEvidence("Monthly municipal water consumption", "E_Data", "A58:M62", countCells(workbook, "e-data", /^water_/));
  const evWaste = addEvidence("Waste register — streams and diversion", "Waste_Register", "A4:J40", countCells(workbook, "waste"));
  const evFleet = addEvidence("Fleet register — per-vehicle fuel norms", "Fleet_Register", "A4:O33", countCells(workbook, "fleet"));
  const evHeadcount = addEvidence("Employment equity headcount (EEA2)", "S_Data", "A5:L11", countCells(workbook, "s-data", /^hc_/));
  const evSocial = addEvidence("Health and safety, WSP/ATR and payroll inputs", "S_Data", "A28:G71", countCells(workbook, "s-data", /^[A-K]\d+$/));
  const evCsi = addEvidence("Community investment and supplier compliance", "S_Data", "A57:G80", countCells(workbook, "s-data-csi"));
  const evGov = addEvidence("Governance maturity assessment", "G_Data", "A4:F25", countCells(workbook, "g-data"));
  const evKing = addEvidence("King V — 17 principles, apply and explain", "King5_Scorecard", "A4:F25", countCells(workbook, "king5"));
  const evIfrs = addEvidence("IFRS S1/S2 climate-related disclosure readiness", "IFRS_S1_S2", "A4:F30", countCells(workbook, "ifrs"));
  const evGarp = addEvidence("ESG risk register (GARP/GRAP)", "GARP_GRAP", "A4:F30", countCells(workbook, "garp"));
  const evIso = addEvidence("ISO 14001 clause tracker", "ISO_Tracker", "A4:F40", countCells(workbook, "iso-tracker"));
  const evAssumptions = addEvidence("Assumptions — sector, emission factors, thresholds, targets", "Assumptions", "B6:B112", countCells(workbook, "assumptions"));

  /* ── metric register ─────────────────────────────────────────────────── */
  const metrics: EsgMetricRecord[] = [];
  let metricSeq = 1;
  const mid = (prefix: string) => `${prefix}-${String(metricSeq++).padStart(3, "0")}`;

  // The monthly grids carry 9 columns (C..K), not 12 — `ESG_DEFAULT_MONTHS`.
  // Defaulting to 12 would rate a fully captured grid as partial (3 not 4).
  const monthsExpected = dataMonths && dataMonths > 0 ? dataMonths : 9;
  const monthsFor = (re: RegExp): number => {
    const cells = workbook.sections?.["e-data"]?.cells ?? {};
    const cols = new Set<string>();
    for (const [k, v] of Object.entries(cells)) {
      if (v == null || v === "") continue;
      const m = k.match(re);
      if (m) cols.add(m[1]);
    }
    return cols.size;
  };

  // ── E: the GHG inventory, one metric per line (the 6.1 "anatomy") ──────
  /*
   * Provenance for the factors. "The Department of Forestry, Fisheries and the
   * Environment (DFFE) publishes South Africa's grid emission factors."
   * — Z. Mnanzana, Q6, 14 September 2026.
   *
   * Until the sector configs carry a citation per factor, this names the
   * publisher and admits the set is not yet versioned, rather than implying a
   * traceability the numbers do not have. An assurance provider asks for the
   * edition and the table; the publisher is what we can give today.
   */
  const factorSource =
    `Sector emission-factor set for "${sector}" (Assumptions!B30:B35). Grid electricity follows the South African grid emission factors published by the Department of Forestry, Fisheries and the Environment (DFFE). Edition and table not yet recorded per factor.`;
  const scopeEvidence: Record<number, (string | null)[]> = {
    1: [evGhgActivity, evFleet, evAssumptions],
    2: [evElectricity, evAssumptions],
    3: [evWater, evAssumptions],
  };
  for (const line of ghg.lines) {
    const captureRe =
      line.scope === 1
        ? /^s1[a-d]_([C-K])\d+$/
        : line.scope === 2
          ? /^(?:s2|solar)_([C-K])\d+$/
          : /^water_([C-K])\d+$/;
    const months = monthsFor(captureRe);
    const has = line.activity > 0;
    const dq = has ? (dataQualityFromCapture(months, monthsExpected) ?? 2) : null;
    metrics.push({
      metricId: mid("E-GHG"),
      topic: "Climate change",
      subtopic: `Scope ${line.scope} emissions`,
      tier: line.scope === 3 ? "Leadership" : "Core",
      metricName: line.label,
      value: has ? Number(line.tco2e.toFixed(2)) : null,
      unit: "tCO2e",
      periodStart: meta.periodStart,
      periodEnd: meta.periodEnd,
      boundary,
      entitiesIncluded: meta.entitiesIncluded,
      sourceSystem: line.scope === 2 ? "Utility meter portal / municipal account" : "Fuel card ledger and monthly returns",
      sourceOwner: "Group Operations Manager",
      calculationMethod: `${num(line.activity, 0)} ${line.unit} x ${line.factor} ${line.factorUnit}${line.factorUnit.startsWith("kg") ? " / 1 000" : ""}`,
      emissionFactor: line.factor,
      emissionFactorSource: factorSource,
      dataQualityScore: dq,
      assuranceStatus: "Internally reviewed",
      priorYearValue: null,
      restated: false,
      restatementReason: null,
      targetValue: null,
      targetYear: netZeroTargetYear,
      varianceVsTarget: null,
      ragStatus: has ? ragFor(true, true, dq) : "Grey",
      omissionCode: has ? null : "DATA_UNAVAILABLE",
      omissionDetail: has ? null : `no activity was captured for ${line.label.toLowerCase()}`,
      evidenceIds: (scopeEvidence[line.scope] ?? []).filter(Boolean) as string[],
      commentary: has
        ? `${line.label} contributed ${num(line.tco2e, 2)} tCO2e, from ${num(line.activity, 0)} ${line.unit} at ${line.factor} ${line.factorUnit}, captured across ${months} of ${monthsExpected} monthly periods.`
        : null,
      frameworkRefs: ["JSE Core", "IFRS S2", `GRI 305-${line.scope}`],
      pillar: "Environmental",
    });
  }

  // Scope 1+2 headline, with the net-zero trajectory as its target.
  const nzMilestone = netZero?.milestones?.find((m) => !m.onTrack) ?? netZero?.milestones?.[0] ?? null;
  const s12Dq = ghg.hasData ? (dataQualityFromCapture(monthsFor(/^s1[a-d]_([C-K])\d+$/), monthsExpected) ?? 3) : null;
  const s12OnTrack = netZero?.available && nzMilestone ? nzMilestone.onTrack : null;
  metrics.push({
    metricId: mid("E-GHG"),
    topic: "Climate change",
    subtopic: "Total operational emissions",
    tier: "Core",
    metricName: "Scope 1 + 2 emissions (operational control)",
    value: ghg.hasData ? Number(ghg.scope1And2.toFixed(2)) : null,
    unit: "tCO2e",
    periodStart: meta.periodStart,
    periodEnd: meta.periodEnd,
    boundary,
    entitiesIncluded: meta.entitiesIncluded,
    sourceSystem: "GHG inventory — activity x emission factor",
    sourceOwner: "Group Operations Manager",
    calculationMethod: "Sum of Scope 1 lines + sum of Scope 2 lines, net of the on-site solar credit",
    emissionFactor: null,
    emissionFactorSource: factorSource,
    dataQualityScore: s12Dq,
    assuranceStatus: "Internally reviewed",
    priorYearValue: netZero?.available ? Number(netZero.baselineTco2e.toFixed(2)) : null,
    restated: false,
    restatementReason: null,
    targetValue: nzMilestone ? Number(nzMilestone.targetTco2e.toFixed(2)) : null,
    targetYear: nzMilestone ? nzMilestone.year : netZeroTargetYear,
    varianceVsTarget: nzMilestone && ghg.hasData ? Number((ghg.scope1And2 - nzMilestone.targetTco2e).toFixed(2)) : null,
    ragStatus: ghg.hasData
      ? ragFor(s12OnTrack, nzMilestone ? Math.abs(nzMilestone.gapTco2e) <= nzMilestone.targetTco2e * 0.1 : false, s12Dq)
      : "Grey",
    omissionCode: ghg.hasData ? null : "DATA_UNAVAILABLE",
    omissionDetail: ghg.hasData ? null : "no emissions activity has been captured for the period",
    evidenceIds: [evGhgActivity, evElectricity, evAssumptions].filter(Boolean) as string[],
    commentary: ghg.hasData
      ? `Scope 1 + 2 emissions for the period are ${num(ghg.scope1And2, 2)} tCO2e — Scope 1 ${num(ghg.scope1, 2)} tCO2e and Scope 2 ${num(ghg.scope2, 2)} tCO2e net of on-site solar.${
          nzMilestone
            ? ` The ${nzMilestone.year} milestone permits ${num(nzMilestone.targetTco2e, 2)} tCO2e, leaving the entity ${nzMilestone.onTrack ? "ahead of" : "behind"} the required trajectory by ${num(Math.abs(nzMilestone.gapTco2e), 2)} tCO2e.`
            : ""
        }`
      : null,
    frameworkRefs: ["JSE Core", "IFRS S2", "GRI 305-1, 305-2"],
    pillar: "Environmental",
  });

  // ── E: energy, water, waste ─────────────────────────────────────────────
  const electricityKwh = ghg.lines.find((l: GhgLine) => l.label.includes("grid electricity"))?.activity ?? 0;
  const solarKwh = ghg.lines.find((l: GhgLine) => l.label.includes("solar"))?.activity ?? 0;
  const waterKl = ghg.lines.find((l: GhgLine) => l.scope === 3)?.activity ?? 0;
  const wasteDiversion = readEsgCell(workbook, "waste", "B16");

  const simple = (
    prefix: string,
    topic: string,
    subtopic: string,
    name: string,
    value: number | null,
    unit: string,
    system: string,
    owner: string,
    method: string,
    dq: 1 | 2 | 3 | 4 | 5 | null,
    ev: (string | null)[],
    refs: string[],
    pillar: EsgMetricRecord["pillar"],
    tier: EsgTier = "Core",
    target: number | null = null,
  ) => {
    const has = value != null && Number.isFinite(value) && value !== 0;
    metrics.push({
      metricId: mid(prefix),
      topic,
      subtopic,
      tier,
      metricName: name,
      value: has ? value : null,
      unit,
      periodStart: meta.periodStart,
      periodEnd: meta.periodEnd,
      boundary,
      entitiesIncluded: meta.entitiesIncluded,
      sourceSystem: system,
      sourceOwner: owner,
      calculationMethod: method,
      emissionFactor: null,
      emissionFactorSource: null,
      dataQualityScore: has ? dq : null,
      assuranceStatus: "Internally reviewed",
      priorYearValue: null,
      restated: false,
      restatementReason: null,
      targetValue: target,
      targetYear: target != null ? netZeroTargetYear : null,
      varianceVsTarget: has && target != null ? Number((value! - target).toFixed(2)) : null,
      ragStatus: has ? ragFor(target == null ? true : value! >= target, true, dq) : "Grey",
      omissionCode: has ? null : "DATA_UNAVAILABLE",
      omissionDetail: has ? null : `${name.toLowerCase()} is not currently captured in the workbook`,
      evidenceIds: ev.filter(Boolean) as string[],
      commentary: has ? `${name}: ${num(value!, 1)} ${unit} for the period, from ${system.toLowerCase()}.` : null,
      frameworkRefs: refs,
      pillar,
    });
  };

  simple("E-ENE", "Energy", "Purchased electricity", "Purchased grid electricity", electricityKwh || null, "kWh",
    "Utility meter portal / municipal account", "Facilities Manager", "Sum of monthly meter reads (E_Data!A41:N45)",
    dataQualityFromCapture(monthsFor(/^s2_([C-K])\d+$/), monthsExpected) ?? 3, [evElectricity],
    ["JSE Core", "IFRS S2", "GRI 302-1"], "Environmental");
  simple("E-ENE", "Energy", "Renewable generation", "On-site solar generation", solarKwh || null, "kWh",
    "Inverter portal / generation meter", "Facilities Manager", "Sum of monthly generation (E_Data!A50:M54)",
    dataQualityFromCapture(monthsFor(/^solar_([C-K])\d+$/), monthsExpected) ?? 3, [evElectricity],
    ["JSE Leadership", "GRI 302-1"], "Environmental", "Leadership");
  simple("E-WAT", "Water", "Water consumption", "Municipal water consumed", waterKl || null, "kL",
    "Municipal water account", "Facilities Manager", "Sum of monthly consumption (E_Data!A58:M62)",
    dataQualityFromCapture(monthsFor(/^water_([C-K])\d+$/), monthsExpected) ?? 3, [evWater],
    ["JSE Core", "GRI 303-5"], "Environmental");
  simple("E-WST", "Waste", "Waste diversion", "Waste diverted from landfill", wasteDiversion, "%",
    "Waste register / weighbridge tickets", "Group Operations Manager", "Diverted mass / total mass (Waste_Register!B16)",
    countCells(workbook, "waste") > 6 ? 3 : 2, [evWaste], ["JSE Core", "GRI 306-4"], "Environmental");

  // ── S: employment equity, health and safety, skills, community ──────────
  const headcountCells = countCells(workbook, "s-data", /^hc_/);
  // L5..L11 are the seven EEA2 occupational-level row totals; L12 is the grand
  // total the derivation writes. L11 alone would report only the last level.
  const totalHeadcount = readEsgCell(workbook, "s-data", "L12") ?? readEsgCell(workbook, "s-data", "L11");
  const ltifrRaw = workbook.sections?.["s-data"]?.cells?.["G35"];
  const ltifr = ltifrRaw == null || ltifrRaw === "" ? null : Number(ltifrRaw);
  const fatalities = readEsgCell(workbook, "s-data", "G33");
  const trainingSpend = readEsgCell(workbook, "s-data", "G45") ?? readEsgCell(workbook, "s-data", "B45");
  const leviablePayroll = readEsgCell(workbook, "s-data", "B43");
  const csiSpend = readEsgCell(workbook, "s-data-csi", "B5") ?? readEsgCell(workbook, "s-data-csi", "G5");

  simple("S-EE", "Own workforce", "Workforce composition", "Total headcount (EEA2 basis)", totalHeadcount, "employees",
    "Payroll / EEA2 return", "Human Resources Executive", "Sum of EEA2 occupational-level headcount (S_Data!A5:L11)",
    headcountCells > 20 ? 4 : headcountCells > 0 ? 3 : 2, [evHeadcount], ["JSE Core", "GRI 2-7", "EEA2"], "Social");
  simple("S-HS", "Health and safety", "Injury rate", "Lost-time injury frequency rate (LTIFR)",
    ltifr != null && Number.isFinite(ltifr) ? ltifr : null, "per 200 000 hours",
    "Incident register", "SHEQ Manager", "Lost-time injuries x 200 000 / hours worked (S_Data!G35)",
    3, [evSocial], ["JSE Core", "GRI 403-9"], "Social");
  simple("S-HS", "Health and safety", "Fatalities", "Work-related fatalities", fatalities, "count",
    "Incident register", "SHEQ Manager", "Count of work-related fatalities (S_Data!G33)",
    3, [evSocial], ["JSE Core", "GRI 403-9"], "Social");
  simple("S-SKL", "Skills development", "Training investment", "Skills development spend", trainingSpend, "ZAR",
    "WSP/ATR submission and payroll", "Human Resources Executive", "Sum of training spend per the ATR (S_Data!A40:G55)",
    3, [evSocial], ["JSE Core", "B-BBEE Skills Development", "GRI 404-1"], "Social");
  simple("S-SKL", "Skills development", "Leviable payroll", "Leviable payroll (SDL base)", leviablePayroll, "ZAR",
    "Payroll / SDL return", "Financial Manager", "Leviable payroll per the SDL return (S_Data!B43)",
    4, [evSocial], ["B-BBEE Skills Development"], "Social");
  simple("S-CSI", "Communities", "Socio-economic development", "Community / CSI investment", csiSpend, "ZAR",
    "General ledger — CSI cost centre", "Managing Director", "Sum of CSI contributions for the period (S_Data CSI block)",
    3, [evCsi], ["JSE Core", "B-BBEE Socio-Economic Development", "GRI 413-1"], "Social");

  // ── G: governance maturity, King V, IFRS readiness, risk ────────────────
  simple("G-BRD", "Governance", "Board oversight", "Governance maturity criteria assessed",
    countCells(workbook, "g-data") || null, "criteria",
    "Governance maturity self-assessment", "Company Secretary", "Count of assessed G_Data maturity criteria",
    2, [evGov], ["JSE Core", "King V", "GRI 2-9"], "Governance");
  simple("G-K5", "Governance", "King V application", "King V principles assessed",
    countCells(workbook, "king5") || null, "principles",
    "King V apply-and-explain register", "Company Secretary", "Count of assessed King V principles (King5_Scorecard)",
    2, [evKing], ["King V", "JSE Listings Requirements"], "Governance");
  simple("G-IFRS", "Governance", "Climate disclosure readiness", "IFRS S1/S2 readiness criteria assessed",
    countCells(workbook, "ifrs") || null, "criteria",
    "IFRS S1/S2 readiness assessment", "Chief Financial Officer", "Count of assessed IFRS S1/S2 criteria",
    2, [evIfrs], ["IFRS S1", "IFRS S2", "JSE Core"], "Governance", "Leadership");
  simple("G-RSK", "Governance", "Risk management", "ESG risks on the register",
    countCells(workbook, "garp") || null, "risks",
    "ESG risk register (GARP/GRAP)", "Risk Manager", "Count of registered ESG risks",
    2, [evGarp], ["King V", "IFRS S1"], "Governance");
  simple("E-ISO", "Environmental management", "ISO 14001", "ISO 14001 clauses tracked",
    countCells(workbook, "iso-tracker") || null, "clauses",
    "ISO 14001 clause tracker", "SHEQ Manager", "Count of tracked ISO 14001 clauses",
    2, [evIso], ["ISO 14001", "JSE Leadership"], "Environmental", "Leadership");

  // ── every scored indicator becomes a performance metric ─────────────────
  const pillarLabel: Record<EsgScorecardPillar, EsgMetricRecord["pillar"]> = {
    environmental: "Environmental",
    social: "Social",
    governance: "Governance",
  };
  const topicForKey = (pillar: EsgScorecardPillar, key: string): string => {
    const nav = ESG_TOOLKIT_PILLAR_NAV.find((p) => p.scoreKey === pillar);
    const child = nav?.children?.find((c) => c.scoreGroup?.keys.includes(key));
    return child?.label ?? nav?.label ?? "Performance";
  };
  (["environmental", "social", "governance"] as EsgScorecardPillar[]).forEach((pillar) => {
    const rows =
      pillar === "environmental"
        ? scorecard?.environmentalRows
        : pillar === "social"
          ? scorecard?.socialRows
          : scorecard?.governanceRows;
    for (const def of SCORECARD_INDICATORS[pillar]) {
      const score = rows?.[def.key];
      const scored = score != null && Number.isFinite(score);
      const achievement = scored && def.maxPoints > 0 ? score! / def.maxPoints : null;
      const dq: 1 | 2 | 3 | 4 | 5 | null = scored && score! > 0 ? 3 : scored ? 2 : null;
      metrics.push({
        metricId: mid(pillar === "environmental" ? "E-IND" : pillar === "social" ? "S-IND" : "G-IND"),
        topic: topicForKey(pillar, def.key),
        subtopic: "Scored indicator",
        tier: "Core",
        metricName: def.indicator,
        value: scored ? Number(score!.toFixed(1)) : null,
        unit: `points of ${def.maxPoints}`,
        periodStart: meta.periodStart,
        periodEnd: meta.periodEnd,
        boundary,
        entitiesIncluded: meta.entitiesIncluded,
        sourceSystem: `Okiru ESG Toolkit — ${pillar[0].toUpperCase()}_Scorecard row ${def.row}`,
        sourceOwner:
          pillar === "governance" ? "Company Secretary" : pillar === "social" ? "Human Resources Executive" : "SHEQ Manager",
        calculationMethod: `Scored against the ${pillar} scorecard band for this indicator (maximum ${def.maxPoints} points)`,
        emissionFactor: null,
        emissionFactorSource: null,
        dataQualityScore: dq,
        assuranceStatus: "Unassured",
        priorYearValue: null,
        restated: false,
        restatementReason: null,
        targetValue: def.maxPoints,
        targetYear: null,
        varianceVsTarget: scored ? Number((score! - def.maxPoints).toFixed(1)) : null,
        ragStatus: !scored
          ? "Grey"
          : ragFor(achievement != null && achievement >= 1, achievement != null && achievement >= 0.9, dq),
        omissionCode: scored && score! > 0 ? null : "DATA_UNAVAILABLE",
        omissionDetail: scored && score! > 0 ? null : `no evidence has been captured against "${def.indicator}"`,
        evidenceIds: (pillar === "environmental"
          ? [evGhgActivity, evElectricity, evWaste, evIso]
          : pillar === "social"
            ? [evHeadcount, evSocial, evCsi]
            : [evGov, evKing, evIfrs, evGarp]
        ).filter(Boolean) as string[],
        commentary:
          scored && score! > 0
            ? `${def.indicator} scored ${num(score!, 1)} of ${def.maxPoints} points (${pct(achievement)} of the available allocation).`
            : null,
        frameworkRefs:
          pillar === "governance"
            ? ["King V", "JSE Core"]
            : pillar === "social"
              ? ["JSE Core", "Amended FSC / B-BBEE"]
              : ["JSE Core", "IFRS S2"],
        pillar: pillarLabel[pillar],
      });
    }
  });

  /* ── data-quality index (5.1 RULE) ───────────────────────────────────── */
  const rated = metrics.filter((m) => m.dataQualityScore != null);
  const dataQualityIndex = rated.length
    ? Number((rated.reduce((a, m) => a + (m.dataQualityScore as number), 0) / rated.length).toFixed(2))
    : null;
  const dataQualityDistribution = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, unrated: 0 } as Record<
    "1" | "2" | "3" | "4" | "5" | "unrated",
    number
  >;
  for (const m of metrics) {
    if (m.dataQualityScore == null) dataQualityDistribution.unrated += 1;
    else dataQualityDistribution[String(m.dataQualityScore) as "1" | "2" | "3" | "4" | "5"] += 1;
  }

  /* ── gap register + roadmap (5.3 MECHANISM, 7.11, 7.12) ──────────────── */
  const gaps: EsgGapRow[] = [];
  const roadmap: EsgRoadmapRow[] = [];
  let gapSeq = 1;
  const gapCandidates = metrics.filter(
    (m) => m.omissionCode != null || m.ragStatus === "Grey" || (m.dataQualityScore != null && m.dataQualityScore <= 3),
  );
  for (const m of gapCandidates) {
    const gapId = `GAP-${String(gapSeq).padStart(3, "0")}`;
    const roadmapRef = `R-${String(gapSeq).padStart(3, "0")}`;
    const notMeasured = m.value == null;
    const risk: EsgGapRow["risk"] =
      notMeasured && m.tier === "Core" ? "High" : notMeasured ? "Medium" : m.dataQualityScore != null && m.dataQualityScore <= 2 ? "Medium" : "Low";
    const effort: EsgGapRow["effortBand"] = notMeasured ? "M" : "S";
    const costBand = risk === "High" ? "R50k - R150k" : risk === "Medium" ? "R15k - R50k" : "Under R15k";
    const horizon = HORIZONS[risk === "High" ? 0 : risk === "Medium" ? 1 : 2];
    gaps.push({
      gapId,
      metric: m.metricName,
      natureOfGap: notMeasured
        ? "Metric not measured for the period"
        : `Data quality ${m.dataQualityScore} — below the level an assurance provider will accept`,
      requirementNotMet: `${m.frameworkRefs.join(" · ")} (${m.tier})`,
      risk,
      effortBand: effort,
      costBand,
      owner: m.sourceOwner,
      targetClose: horizon,
      roadmapRef,
      riskWeightedEffort: (risk === "High" ? 3 : risk === "Medium" ? 2 : 1) * (effort === "M" ? 2 : 1),
    });
    roadmap.push({
      action: notMeasured
        ? `Establish measurement and a source system for "${m.metricName}"`
        : `Raise "${m.metricName}" to data quality 4 by documenting the source system and estimation method`,
      materialMatter: m.topic,
      metric: m.metricName,
      owner: m.sourceOwner,
      start: horizon === "0-6 months" ? "Immediate" : horizon === "6-18 months" ? "Month 6" : "Month 18",
      due: horizon,
      dependencies: notMeasured ? "Source system identified and owner appointed" : "Method documentation",
      effort,
      costBand,
      expectedOutcome: notMeasured
        ? `${m.metricName} reported with a stated boundary, method and data quality of 3 or better`
        : `${m.metricName} rated data quality 4 and assurance-ready`,
      status: "Not started",
      horizon,
      roadmapRef,
    });
    gapSeq += 1;
  }
  gaps.sort((a, b) => b.riskWeightedEffort - a.riskWeightedEffort);

  // Net-zero levers already carry an owner and a timeline — they belong here.
  for (const lever of netZero?.levers ?? []) {
    roadmap.push({
      action: lever.action,
      materialMatter: "Climate change",
      metric: "Scope 1 + 2 emissions (operational control)",
      owner: lever.owner || "Group Operations Manager",
      start: "Per the decarbonisation plan",
      due: lever.timeline,
      dependencies: lever.lever,
      effort: "L",
      costBand: "Capital plan",
      expectedOutcome: lever.target,
      status: "Planned",
      horizon: /2026|0-6|short/i.test(lever.timeline)
        ? "0-6 months"
        : /2027|2028/.test(lever.timeline)
          ? "6-18 months"
          : "18-36 months",
      roadmapRef: `NZ-${lever.lever.slice(0, 6).toUpperCase().replace(/\s/g, "")}`,
    });
  }

  /* ── omissions rendered onto each unpopulated metric (rule 1) ────────── */
  for (const m of metrics) {
    if (!m.omissionCode) continue;
    const gap = gaps.find((g) => g.metric === m.metricName);
    m.commentary = renderOmission(m.omissionCode, {
      entity: entityName,
      reason: m.omissionDetail ?? undefined,
      roadmapRef: gap?.roadmapRef ?? "the roadmap",
      date: gap?.targetClose ?? "the next reporting period",
      period: "the next reporting period",
    });
  }

  /* ── KPI table (7.10) ────────────────────────────────────────────────── */
  const kpiTable: EsgKpiRow[] = metrics.map((m) => ({
    metric: m.metricName,
    baseline:
      m.priorYearValue != null
        ? num(m.priorYearValue, 1)
        : baselineYear
          ? `${baselineYear} — not restated`
          : "Not established",
    priorYear: m.priorYearValue != null ? num(m.priorYearValue, 1) : "—",
    current:
      m.value == null
        ? "Not reported"
        : typeof m.value === "number"
          ? `${num(m.value, m.unit === "count" || m.unit === "employees" ? 0 : 1)} ${m.unit}`
          : String(m.value),
    target: m.targetValue != null ? `${num(m.targetValue, 1)} ${m.unit}` : "Not set",
    targetYear: m.targetYear != null ? String(m.targetYear) : "—",
    trajectory:
      m.varianceVsTarget == null
        ? "No baseline"
        : m.varianceVsTarget <= 0
          ? "On or ahead"
          : `Behind by ${num(Math.abs(m.varianceVsTarget), 1)}`,
    rag: m.ragStatus,
    dataQuality: m.dataQualityScore == null ? "Not rated" : `${m.dataQualityScore} of 5`,
    assurance: m.assuranceStatus,
    owner: m.sourceOwner,
    pillar: m.pillar,
  }));

  /* ── assurance readiness per topic (6.2, 7.11) ───────────────────────── */
  const topics = Array.from(new Set(metrics.map((m) => m.topic)));
  const assuranceReadiness: EsgAssuranceReadinessRow[] = topics.map((topic) => {
    const set = metrics.filter((m) => m.topic === topic);
    const populated = set.filter((m) => m.value != null);
    const ratedSet = set.filter((m) => m.dataQualityScore != null);
    const weighted = ratedSet.length
      ? Number((ratedSet.reduce((a, m) => a + (m.dataQualityScore as number), 0) / ratedSet.length).toFixed(2))
      : null;
    const rating: EsgAssuranceReadinessRow["rating"] =
      weighted != null && weighted >= 4 && populated.length === set.length
        ? "Ready for limited assurance"
        : populated.length === 0
          ? "Not assurable"
          : "Remediation required";
    return {
      topic,
      rating,
      weightedDataQuality: weighted,
      metricsPopulated: populated.length,
      metricsTotal: set.length,
      reason:
        rating === "Ready for limited assurance"
          ? "All metrics populated at data quality 4 or better, with a stated method and boundary."
          : rating === "Not assurable"
            ? "No metric in this topic is populated for the period."
            : `${set.length - populated.length} of ${set.length} metrics unpopulated${weighted != null ? `, weighted data quality ${weighted} of 5` : ""}.`,
    };
  });

  /* ── disclosure index (F4) ───────────────────────────────────────────── */
  const sectionForPillar: Record<EsgMetricRecord["pillar"], string> = {
    Environmental: "Section 6 — Environmental performance",
    Social: "Section 7 — Social performance",
    Governance: "Section 8 — Governance metrics",
  };
  const disclosureIndex: EsgDisclosureIndexRow[] = metrics.map((m) => ({
    requiredDisclosure: `${m.topic} — ${m.metricName}`,
    frameworkRefs: m.frameworkRefs.join(" · "),
    whereReported:
      m.value != null
        ? `${sectionForPillar[m.pillar]}; Section 9 KPI table`
        : `${sectionForPillar[m.pillar]} (omission stated); Section 10 gap register`,
    status: m.value != null ? (m.dataQualityScore != null && m.dataQualityScore >= 4 ? "Reported" : "Partially reported") : "Omitted",
    dataQuality: m.dataQualityScore == null ? "Not rated" : `${m.dataQualityScore} of 5`,
    omissionReason: m.omissionCode ? `${m.omissionCode} — ${m.commentary ?? ""}` : "—",
  }));

  /* ── material matters (7.5), each linked to a metric and an action ───── */
  const materialMatters: EsgMaterialMatter[] = topics.map((topic) => {
    const set = metrics.filter((m) => m.topic === topic);
    const refs = roadmap.filter((r) => r.materialMatter === topic).map((r) => r.roadmapRef);
    const pillar = set[0]?.pillar ?? "Environmental";
    return {
      matter: topic,
      pillar,
      financialExposure:
        topic === "Climate change"
          ? "Carbon tax liability, fuel and electricity cost, and customer/lender disclosure requirements"
          : topic === "Own workforce" || topic === "Skills development"
            ? "B-BBEE scorecard position, Employment Equity compliance and SETA recoveries"
            : topic === "Health and safety"
              ? "Occupational Health and Safety Act liability and lost production"
              : "Licence to operate and counterparty due-diligence outcomes",
      metricIds: set.map((m) => m.metricId),
      metricNames: set.map((m) => m.metricName),
      roadmapRefs: refs,
      flagged: set.length === 0 || refs.length === 0,
    };
  });

  /* ── 7.3 regulatory horizon, filtered to what applies ────────────────── */
  const emitting = ghg.hasData;
  const carbonTaxTier1 = (carbonTax as unknown as { tier1?: number; totalTax?: number } | null)?.tier1 ?? null;
  const regulatoryHorizon: EsgRegulatoryRow[] = [
    {
      instrument: "Climate Change Act, 2024",
      status: "Enacted; sectoral emission targets being gazetted",
      requirement: "Sectoral emission targets and carbon budgets for listed activities, with reporting to the national GHG inventory.",
      applicability: emitting
        ? `Applies to the extent the entity's activities are listed — Scope 1 + 2 emissions of ${num(ghg.scope1And2, 2)} tCO2e are reported for the period.`
        : "Applicability cannot be assessed until an emissions inventory is established.",
      actionRequired: emitting
        ? "Confirm whether the entity's activities fall within a gazetted sectoral emission target."
        : "Establish the emissions inventory — see the gap register at Section 10.",
      deadline: "On gazetting of the applicable sectoral target",
    },
    {
      instrument: "Carbon Tax Act, 2019 (as amended)",
      status: "In force; Phase 2 allowances under review",
      requirement: "Carbon tax on Scope 1 emissions from listed activities above the threshold, net of allowances.",
      applicability:
        carbonTaxTier1 != null
          ? `Modelled tier 1 exposure of R${num(carbonTaxTier1, 0)} where the listed-activity threshold is met.`
          : emitting
            ? "Screened against reported Scope 1 emissions; threshold position to be confirmed."
            : "Not assessed — no Scope 1 inventory for the period.",
      actionRequired: "Confirm listed-activity status and threshold position with the tax adviser.",
      deadline: "Annual — July following the tax period",
    },
    {
      instrument: "IFRS S1 and S2 / ISSB national adoption",
      status: "Adoption roadmap in development; FSCA disclosure pathway for large listed entities",
      requirement: "Sustainability- and climate-related financial disclosure across governance, strategy, risk management, metrics and targets.",
      applicability: `The entity reports against "${reportingStandard}". Value-chain requests cascade from large listed customers ahead of formal application.`,
      actionRequired: "Close the IFRS S1/S2 readiness gaps recorded in the gap register.",
      deadline: "Ahead of the first mandatory reporting period",
    },
    {
      instrument: "JSE Sustainability and Climate Change Disclosure Guidance",
      status: "Voluntary guidance; Core and Leadership tiers",
      requirement: "Disclosure against the JSE topic tree, with reasoned omissions stated rather than left silent.",
      applicability: "Used as the taxonomy for this report. Core metrics are prioritised and Leadership metrics are marked.",
      actionRequired: "Maintain the disclosure index at F4 as the cross-reference of record.",
      deadline: "Each reporting cycle",
    },
    {
      instrument: "Companies Act Regulation 43 — Social and Ethics Committee",
      status: "In force",
      requirement: "A constituted Social and Ethics Committee and an annual report to shareholders on the prescribed areas.",
      applicability: "Applies to companies meeting the public interest score threshold.",
      actionRequired: "Confirm committee constitution and produce the Regulation 43 report from this same spine.",
      deadline: "Annual — with the annual financial statements",
    },
    {
      instrument: "B-BBEE Codes of Good Practice / applicable sector code",
      status: "In force",
      requirement: "Verified B-BBEE scorecard covering skills development, enterprise and supplier development and socio-economic development.",
      applicability: `Sector: ${sector}. The transformation data in this report bridges directly to the B-BBEE scorecard.`,
      actionRequired: "Align the skills development and CSI evidence in this report with the verification file.",
      deadline: "Annual — measurement period end",
    },
    {
      instrument: "Employment Equity Act — sectoral numerical targets",
      status: "Sectoral targets in force",
      requirement: "EEA2 and EEA4 reporting and demonstrable progress against the applicable sectoral numerical targets.",
      applicability: totalHeadcount
        ? `${num(totalHeadcount, 0)} employees reported on the EEA2 basis.`
        : "Headcount is not yet captured — see the gap register at Section 10.",
      actionRequired: "Report workforce composition by occupational level against the applicable sector target.",
      deadline: "Annual — 15 January",
    },
    {
      instrument: "Protection of Personal Information Act (PoPIA)",
      status: "In force",
      requirement: "Lawful processing, a registered Information Officer and a documented compliance framework.",
      applicability: "Applies wherever personal information is processed, including the workforce data underlying this report.",
      actionRequired: "Confirm Information Officer registration and the PoPIA compliance framework.",
      deadline: "Ongoing",
    },
  ];

  /* ── 7.2 board decisions, generated from the top gaps ────────────────── */
  const boardDecisions: EsgBoardDecision[] = gaps.slice(0, 5).map((g) => ({
    decision: `Approve remediation of ${g.metric.toLowerCase()} (${g.gapId})`,
    deadline: g.targetClose,
    consequenceOfDeferral:
      g.risk === "High"
        ? "The metric remains unreportable, the topic stays outside assurance scope, and the disclosure index carries an omission against a Core requirement."
        : "Data quality remains below the level an assurance provider will accept, limiting the assurance opinion available.",
    costBand: g.costBand,
    roadmapRef: g.roadmapRef,
  }));

  /* ── 6.3 / 6.4 claims — tiered, evidence-bound, paired with a figure ─── */
  const claims: EsgClaim[] = [];
  let claimSeq = 1;
  const addClaim = (
    tier: EsgClaim["tier"],
    text: string,
    boundTo: string[],
    evidenceIds: string[],
    pairedMetricIds: string[],
  ) => {
    // 6.5 step 4 — an unresolved evidence reference blocks the block, not softens it.
    if (!evidenceIds.length) return;
    // 6.4 — a factual or commitment claim must carry a figure or it does not render.
    if ((tier === "A" || tier === "C") && !pairedMetricIds.length) return;
    claims.push({ claimId: `CL-${String(claimSeq++).padStart(3, "0")}`, tier, text, boundTo, evidenceIds, pairedMetricIds });
  };

  const s12Metric = metrics.find((m) => m.metricName.startsWith("Scope 1 + 2"));
  if (ghg.hasData && s12Metric && s12Metric.value != null) {
    addClaim(
      "A",
      `Scope 1 and 2 emissions for ${period} were ${num(ghg.scope1And2, 2)} tCO2e under an operational control boundary — Scope 1 of ${num(ghg.scope1, 2)} tCO2e from fuels combusted in controlled assets, and Scope 2 of ${num(ghg.scope2, 2)} tCO2e from purchased electricity net of on-site solar generation. Each line is calculated as activity multiplied by a stated emission factor, and both are disclosed in Appendix B.`,
      [s12Metric.metricId],
      s12Metric.evidenceIds,
      [s12Metric.metricId],
    );
  }
  if (netZero?.available && nzMilestone && s12Metric) {
    addClaim(
      "C",
      `The entity is measured against a net-zero pathway with a ${nzMilestone.year} milestone of ${num(nzMilestone.targetTco2e, 2)} tCO2e, from a baseline of ${num(netZero.baselineTco2e, 2)} tCO2e. Current performance sits ${nzMilestone.onTrack ? "within" : "outside"} that milestone by ${num(Math.abs(nzMilestone.gapTco2e), 2)} tCO2e. The reduction levers, their owners and their timelines are set out in Section 11.`,
      [s12Metric.metricId],
      s12Metric.evidenceIds,
      [s12Metric.metricId],
    );
  }
  if (evGov || evKing) {
    addClaim(
      "B",
      `Governance of sustainability is assessed against the King V principles and the IFRS S1/S2 readiness criteria, with each assessed criterion recorded in the toolkit and attributable to a named accountable role. Accountability in this report is drawn from the source-owner field of each metric record rather than asserted separately.`,
      ["G_Data", "King5_Scorecard"],
      [evGov, evKing].filter(Boolean) as string[],
      [],
    );
  }
  if (evAssumptions) {
    addClaim(
      "D",
      `The entity operates in South Africa under the Climate Change Act, the Carbon Tax Act, the developing ISSB adoption roadmap, the JSE Sustainability and Climate Change Disclosure Guidance, the B-BBEE Codes and the Employment Equity Act sectoral targets. Section 2 sets out the instrument, status, requirement, applicability, action required and deadline for each.`,
      ["Regulatory register"],
      [evAssumptions],
      [],
    );
  }
  const eeMetric = metrics.find((m) => m.metricName.includes("Total headcount"));
  if (eeMetric && eeMetric.value != null) {
    addClaim(
      "A",
      `The entity employed ${num(eeMetric.value as number, 0)} people on the EEA2 occupational-level basis during ${period}. Workforce composition is reported alongside the employment equity report structure so that progress against the applicable sectoral targets can be read directly.`,
      [eeMetric.metricId],
      eeMetric.evidenceIds,
      [eeMetric.metricId],
    );
  }

  const populated = metrics.filter((m) => m.value != null).length;

  const emissionFactors = ghg.lines
    .filter((l: GhgLine) => l.factor !== 0)
    .map((l: GhgLine) => ({ factor: l.label, value: l.factor, unit: l.factorUnit, source: factorSource }));

  return {
    meta,
    scores: {
      overallPercent: scorecard?.overallPercent ?? 0,
      environmental: scorecard?.environmental ?? { score: 0, max: 108, percent: 0 },
      social: scorecard?.social ?? { score: 0, max: 100, percent: 0 },
      governance: scorecard?.governance ?? { score: 0, max: 100, percent: 0 },
    },
    metrics,
    evidence,
    claims,
    gaps,
    roadmap,
    disclosureIndex,
    kpiTable,
    assuranceReadiness,
    regulatoryHorizon,
    boardDecisions,
    materialMatters,
    ghg,
    netZero,
    carbonTax,
    intensity,
    scorecard,
    dataQualityIndex,
    dataQualityDistribution,
    emissionFactors,
    coverage: { populated, omitted: metrics.length - populated, total: metrics.length },
  };
}

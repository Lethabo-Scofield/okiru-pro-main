/**
 * The ESG score, indicator by indicator: what each one measures, what it
 * scored, what it still needs and where to provide it.
 *
 * A total on its own answers none of the questions a client asks next — "why
 * so low?", "what are we missing?", "what would move it?". This is the
 * structure behind the number: every one of the 53 scorecard indicators with
 * its points, its status and, where it scored nothing for want of data, the
 * inputs that are missing, each named the way the input pages name it.
 *
 * The needs mirror the scorers' own gates (environmental.ts, social.ts,
 * governance.ts) on the same DERIVED workbook they score, so "missing" here
 * means exactly "the scorer had nothing to work with". An indicator whose
 * inputs are all present but which scored zero scored zero on the data — a
 * result, not a gap.
 */
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { readEsgCell } from "@/lib/esgWorkbookStorage";
import { deriveEsgSummaryCells } from "./esgDeriveSummary";
import { readEsgGridRows } from "./esgGridRows";
import { SCORECARD_INDICATORS, type EsgScorecardPillar } from "./esgScorecardDefinitions";
import { ESG_TOOLKIT_PILLAR_NAV } from "./esgToolkitNav";
import { esgOverallPercent } from "@/lib/esgScoringDefaults";
import { scoreEnvironmental } from "../../../EsgToolkit/src/lib/calculators/environmental";
import { scoreSocial } from "../../../EsgToolkit/src/lib/calculators/social";
import { scoreGovernance } from "../../../EsgToolkit/src/lib/calculators/governance";
import { computeGhgInventory } from "../../../EsgToolkit/src/lib/calculators/ghgInventory";
import type { EsgExclusion } from "../../../EsgToolkit/src/lib/calculators/esgApplicability";

export type EsgIndicatorStatus =
  /** Every available point earned. */
  | "full"
  /** Inputs present; performance below the target. */
  | "partial"
  /** Scored nothing because inputs the scorer needs are not there. */
  | "missing"
  /** Inputs present, and the result on them is zero. */
  | "zero"
  /** Left out of the score, numerator and denominator alike, with a reason. */
  | "excluded";

export type EsgIndicatorCoverage = {
  pillar: EsgScorecardPillar;
  key: string;
  /** The scorecard's own wording, verbatim from the workbook. */
  indicator: string;
  /** What it measures and how it scores, in plain English. */
  meaning: string;
  points: number;
  maxPoints: number;
  status: EsgIndicatorStatus;
  /** Inputs the scorer needs that are not there. */
  missing: string[];
  /** Inputs that would change the result but whose absence may be the truth (no solar, no EVs). */
  optional: string[];
  /** Why it is left out, when it is. */
  excludedReason?: string;
  /** True when the exclusion is the company's to resolve (declare a target basis, say whether incidents are tracked). */
  excludedFixable?: boolean;
  /** Where to provide what is missing. */
  topic: { id: string; label: string; href: string } | null;
};

export type EsgPillarCoverage = {
  pillar: EsgScorecardPillar;
  score: number;
  /** What the pillar is scored out of after exclusions. */
  denominator: number;
  percent: number;
  indicators: EsgIndicatorCoverage[];
};

export type EsgCoverageResult = {
  overallPercent: number;
  pillars: EsgPillarCoverage[];
  counts: Record<EsgIndicatorStatus, number>;
  /** Points held by indicators that scored nothing for want of data. */
  pointsAwaitingData: number;
};

type Ctx = {
  num: (section: string, cell: string) => number | null;
  text: (section: string, cell: string) => string;
  grid: (prefix: string) => boolean;
  rows: (section: Parameters<typeof readEsgGridRows>[1]) => Array<Record<string, unknown>>;
  hasInventory: boolean;
};

type Need = { label: string; has: (c: Ctx) => boolean; optional?: boolean };
type Spec = { meaning: string; needs: Need[] };

const need = (label: string, has: (c: Ctx) => boolean): Need => ({ label, has });
const maybe = (label: string, has: (c: Ctx) => boolean): Need => ({ label, has, optional: true });
const positive = (section: string, cell: string) => (c: Ctx) => (c.num(section, cell) ?? 0) > 0;
const answered = (section: string, cell: string) => (c: Ctx) => c.text(section, cell) !== "";

const PRO_RATA =
  "Full marks at the target; below it, points pro rata down to the company's stance floor, and nothing beneath that.";

const SPECS: Record<EsgScorecardPillar, Record<string, Spec>> = {
  environmental: {
    d5: {
      meaning: "Awarded when the company records its fleet diesel — the activity a Scope 1 baseline is built from.",
      needs: [need("Monthly fleet diesel (litres), Scope 1A", (c) => c.grid("s1a"))],
    },
    d6: {
      meaning: `This period's Scope 1 + 2 emissions in tonnes, pro-rated to a year, against the company's own baseline. The reduction is measured against the target on Assumptions. ${PRO_RATA}`,
      needs: [
        need("A Scope 1 + 2 baseline in tCO₂e", positive("e-data", "B90")),
        need("This period's fuel and electricity", (c) => c.hasInventory),
      ],
    },
    d7: {
      meaning: `Solar generated as a share of grid electricity, against the renewable-electricity target. ${PRO_RATA}`,
      needs: [
        need("Monthly grid electricity (kWh)", (c) => c.grid("s2")),
        maybe("Monthly solar generation (kWh) — if the company generates any", (c) => c.grid("solar")),
      ],
    },
    d8: {
      meaning: "Awarded when water consumption is recorded — the Scope 3 water line.",
      needs: [need("Monthly municipal water (kL)", (c) => c.grid("water"))],
    },
    d9: {
      meaning: "A net-zero target year the company has set: full marks for a year between 2030 and 2060, half for any other.",
      needs: [need("The net-zero target year", positive("assumptions", "B107"))],
    },
    d11: {
      meaning: "Awarded when electricity consumption is recorded.",
      needs: [need("Monthly grid electricity (kWh)", (c) => c.grid("s2"))],
    },
    d12: {
      meaning: `Electricity this period against the prior year's, as a reduction measured against the same target as emissions. ${PRO_RATA}`,
      needs: [
        need("Prior-year total electricity (kWh)", positive("e-data", "B92")),
        need("Monthly grid electricity (kWh)", (c) => c.grid("s2")),
      ],
    },
    d13: {
      meaning: `Onsite solar as a share of electricity consumed, against the renewable target. ${PRO_RATA}`,
      needs: [
        need("Monthly grid electricity (kWh)", (c) => c.grid("s2")),
        maybe("Monthly solar generation (kWh) — if the company generates any", (c) => c.grid("solar")),
      ],
    },
    d15: {
      meaning: "The share of vehicles whose measured fuel consumption (L/100 km) is within their norm, plus the tolerance on Assumptions.",
      needs: [
        need("Vehicles with litres and kilometres (measured L/100 km)", positive("fleet", "_l100_positive")),
        need("Each vehicle's L/100 km norm", (c) => c.rows("fleet").some((r) => Number(r.l100Norm) > 0)),
      ],
    },
    d16: {
      meaning: "Awarded when the fleet register can measure freight work — vehicles with both a payload and the kilometres they drove.",
      needs: [need("Vehicles with a payload (kg) and monthly kilometres", positive("fleet", "_tonne_km_rows"))],
    },
    d17: {
      meaning: `Electric vehicles as a share of the fleet, against the EV target. ${PRO_RATA}`,
      needs: [
        need("The fleet register (vehicles)", positive("fleet", "B28")),
        maybe("Electric vehicles marked — if the company has any", positive("fleet", "H28")),
      ],
    },
    d19: {
      meaning: `Waste diverted from landfill as a share of all waste, against the diversion target. ${PRO_RATA}`,
      needs: [need("The waste diversion rate (waste register or contractor report)", (c) => c.num("waste", "B16") !== null)],
    },
    d20: {
      meaning: "Awarded when monthly recycling (the Cority % recycled) is tracked.",
      needs: [need("Monthly % recycled (Cority)", positive("waste", "B17"))],
    },
    d21: {
      meaning: "Awarded when landfill waste is measured, so its emissions can be stated.",
      needs: [need("Landfill waste (kg) in the waste register", positive("waste", "B18"))],
    },
    d23: {
      meaning: "Awarded when water consumption is recorded.",
      needs: [need("Monthly municipal water (kL)", (c) => c.grid("water"))],
    },
    d24: {
      meaning: "A water-efficiency initiative: Yes earns full marks, Partial half.",
      needs: [need("Water efficiency initiative (Yes / Partial / No)", answered("e-data", "B94"))],
    },
    d26: {
      meaning: "ISO 14001: certified, or genuinely in progress — counted only when an environmental management system stands behind the claim.",
      needs: [
        need("ISO 14001 certification status on the ISO tracker", positive("iso-tracker", "_cert_score")),
        need("The ISO 14001 clauses assessed", (c) => (c.num("iso-tracker", "_ems_score") ?? 0) - (c.num("iso-tracker", "_cert_score") ?? 0) > 0),
      ],
    },
    d27: {
      meaning: "The environmental aspects register (ISO 14001 clause 6.1.2), as assessed on the ISO tracker.",
      needs: [need("Environmental aspects register assessed (ISO tracker)", positive("iso-tracker", "_aspects_score"))],
    },
    d28: {
      meaning: "An environmental policy — the stricter of the board's own declaration and the ISO clause 5.2 assessment.",
      needs: [
        need("Board-approved environmental policy (Governance)", positive("g-data", "F27")),
        need("ISO clause 5.2 policy assessed (ISO tracker)", positive("iso-tracker", "_policy_score")),
      ],
    },
    d29: {
      meaning: "A legal register (ISO clause 6.1.3), counted only where the governance risk register is live.",
      needs: [
        need("Risk register updated (Governance)", positive("g-data", "F21")),
        need("Legal register assessed (ISO tracker)", positive("iso-tracker", "_legal_score")),
      ],
    },
  },
  social: {
    d5: {
      meaning: `Black employees as a share of the workforce, against the company's target. ${PRO_RATA}`,
      needs: [need("Workforce headcount by race and gender", positive("s-data", "L12"))],
    },
    d6: {
      meaning: `Black women as a share of top and senior management, against the target. ${PRO_RATA}`,
      needs: [need("Top and senior management headcount by race and gender", (c) => (c.num("s-data", "L5") ?? 0) + (c.num("s-data", "L6") ?? 0) > 0)],
    },
    d7: {
      meaning: "An Employment Equity plan submitted to the Department of Employment and Labour: Yes full marks, Partial half.",
      needs: [need("Employment Equity plan submitted", answered("ee", "B9"))],
    },
    d8: {
      meaning: `Employees with disabilities as a share of headcount, against the target. ${PRO_RATA}`,
      needs: [need("Employees with disabilities (share of headcount)", (c) => c.num("ee", "B8") !== null)],
    },
    d9: {
      meaning: "An Employment Equity forum consulted: Yes full marks, Partial half.",
      needs: [need("Employment Equity forum consulted", answered("ee", "B10"))],
    },
    d10: {
      meaning: "Numerical EE targets set per level, race and gender: Yes full marks, Partial half.",
      needs: [need("Numerical targets set per level, race and gender", answered("ee", "B12"))],
    },
    d12: {
      meaning: "A Workplace Skills Plan submitted.",
      needs: [need("WSP submitted (Yes / No)", answered("s-data", "B45"))],
    },
    d13: {
      meaning: "An Annual Training Report submitted.",
      needs: [need("ATR submitted (Yes / No)", answered("s-data", "B46"))],
    },
    d14: {
      meaning: `Training hours per employee, against the target. ${PRO_RATA}`,
      needs: [
        need("Total training hours delivered", positive("s-data", "B49")),
        need("Workforce headcount", positive("s-data", "L12")),
      ],
    },
    d15: {
      meaning: "Mandatory grant recovered against the skills levy.",
      needs: [
        need("Leviable payroll (R)", positive("s-data", "B43")),
        need("Mandatory grant claimed (R)", positive("s-data", "B47")),
      ],
    },
    d17: {
      meaning: "Lost-time injuries per 1,000,000 hours worked, at or below the company's ceiling.",
      needs: [
        need("Hours worked each quarter", (c) => ["C27", "D27", "E27", "F27"].some((ref) => (c.num("s-data", ref) ?? 0) > 0)),
        need("Lost-time injuries each quarter (0 where there were none)", (c) => c.num("s-data", "G35") !== null),
      ],
    },
    d18: {
      meaning: "Zero fatalities, as a count the company reports — an empty cell is not an attestation.",
      needs: [need("Fatalities each quarter (enter 0 for none)", (c) => c.num("s-data", "G28") !== null)],
    },
    d19: {
      meaning: "A driver fatigue programme: learners on the fatigue programme, or a driver debrief register in use.",
      needs: [
        need("Driver fatigue programme (OFO learners or the driver debrief register)", (c) =>
          (c.num("driver-debrief", "_active") ?? 0) > 0 || (c.num("s-data", "C59") ?? 0) > 0),
      ],
    },
    d20: {
      meaning: "Incident investigation in place: incidents recorded, or a declared clean year against a live register.",
      needs: [
        need("Incidents recorded, or whether the company tracks them", (c) =>
          ["G29", "G30", "G31", "G32", "G33"].some((ref) => (c.num("s-data", ref) ?? 0) > 0) ||
          c.text("s-data", "_hsTracking") !== ""),
      ],
    },
    d22: {
      meaning: `Community (CSI) spend as a share of net profit after tax, against the target. ${PRO_RATA}`,
      needs: [
        need("Net profit after tax (R)", positive("s-data", "B84")),
        need("CSI spend (CSI register)", positive("s-data", "D82")),
      ],
    },
    d23: {
      meaning: `Community initiatives run in the year, against six a year. ${PRO_RATA}`,
      needs: [need("CSI initiatives (CSI register)", positive("s-data", "_initiatives_count"))],
    },
    d24: {
      meaning: `Local procurement as a share of measured procurement spend, against the target. ${PRO_RATA}`,
      needs: [
        need("Local procurement spend (R)", positive("s-data", "B86")),
        need("Total measured procurement spend (R)", positive("s-data", "B87")),
      ],
    },
    d26: {
      meaning: `Suppliers' average health-and-safety rating, scaled by how many of the company's suppliers were assessed. ${PRO_RATA}`,
      needs: [
        need("Supplier assessments (SAQ register)", positive("saq", "_supplier_count")),
        maybe("How many suppliers the company has, so coverage can be measured", (c) => c.num("saq", "_coverage") !== null),
      ],
    },
    d27: {
      meaning: `Suppliers' average food-safety rating, scaled by coverage. ${PRO_RATA}`,
      needs: [
        need("Supplier assessments (SAQ register)", positive("saq", "_supplier_count")),
        maybe("How many suppliers the company has, so coverage can be measured", (c) => c.num("saq", "_coverage") !== null),
      ],
    },
  },
  governance: {
    d5: {
      meaning: "The King V principles, each assessed on the King V register, as a share of the full score.",
      needs: [need("King V principles assessed (King V register)", positive("king5", "E21"))],
    },
    d6: {
      meaning: "A Social & Ethics committee active.",
      needs: [need("Social & Ethics committee active (Yes / Partial / No)", answered("g-data", "B13"))],
    },
    d7: {
      meaning: "ESG performance linked to executive remuneration.",
      needs: [need("ESG linked to executive remuneration (Yes / Partial / No)", answered("g-data", "B14"))],
    },
    d9: {
      meaning: "IFRS S1 / S2 disclosures, each assessed on the IFRS register, as a share of the full score.",
      needs: [need("IFRS S1 / S2 disclosures assessed (IFRS register)", positive("ifrs", "E29"))],
    },
    d10: {
      meaning: "Climate risk recorded in the risk register.",
      needs: [need("Climate risk in the risk register (Yes / Partial / No)", answered("g-data", "B23"))],
    },
    d12: {
      meaning: "A live risk register, with climate risk in it for full marks.",
      needs: [
        need("Risk register updated (Yes / Partial / No)", answered("g-data", "B21")),
        need("Climate risk in the risk register (Yes / Partial / No)", answered("g-data", "B23")),
      ],
    },
    d14: {
      meaning: "Board composition reported.",
      needs: [need("Board members (total)", positive("g-data", "B5"))],
    },
    d16: {
      meaning: "A POPIA Information Officer appointed.",
      needs: [need("POPIA Information Officer appointed (Yes / Partial / No)", answered("g-data", "B17"))],
    },
    d17: {
      meaning: "A POPIA impact assessment done.",
      needs: [need("POPIA impact assessment done (Yes / Partial / No)", answered("g-data", "B18"))],
    },
    d19: {
      meaning: "An integrated report published.",
      needs: [need("Integrated report published (Yes / Partial / No)", answered("g-data", "B20"))],
    },
    d20: {
      meaning: "External assurance of the ESG report.",
      needs: [need("External assurance of the ESG report (Yes / Partial / No)", answered("g-data", "B19"))],
    },
    d22: {
      meaning: "A code of ethics and a whistleblower hotline, averaged.",
      needs: [
        need("Code of ethics in place (Yes / Partial / No)", answered("g-data", "B15")),
        need("Whistleblower hotline active (Yes / Partial / No)", answered("g-data", "B16")),
      ],
    },
    d24: {
      meaning: "The risk register kept up to date.",
      needs: [need("Risk register updated (Yes / Partial / No)", answered("g-data", "B21"))],
    },
    d25: {
      meaning: "No material regulatory penalties, as a count the company reports — an empty cell is not an attestation.",
      needs: [need("Material regulatory penalties in the period (enter 0 for none)", (c) => c.num("g-data", "B25") !== null)],
    },
  },
};

/** Exclusions the company resolves by answering a question, not ones that are final. */
const FIXABLE_EXCLUSION = /has not declared how its targets are set|has not set one for|has not said whether it tracks/i;

function topicFor(pillar: EsgScorecardPillar, key: string): EsgIndicatorCoverage["topic"] {
  for (const item of ESG_TOOLKIT_PILLAR_NAV) {
    for (const child of item.children ?? []) {
      if (child.scoreGroup?.pillar === pillar && child.scoreGroup.keys.includes(key)) {
        return { id: child.id, label: child.label, href: child.href };
      }
    }
  }
  return null;
}

export function computeEsgIndicatorCoverage(rawWorkbook: EsgWorkbookData): EsgCoverageResult {
  const workbook = deriveEsgSummaryCells(rawWorkbook);
  const scored: Record<EsgScorecardPillar, { rows: Record<string, number>; excluded: EsgExclusion[]; score: number; scoringDenominator: number }> = {
    environmental: scoreEnvironmental(workbook),
    social: scoreSocial(workbook),
    governance: scoreGovernance(workbook),
  };

  const eData = workbook.sections?.["e-data"]?.cells ?? {};
  const ctx: Ctx = {
    num: (section, cell) => readEsgCell(workbook, section, cell),
    text: (section, cell) => String(workbook.sections?.[section]?.cells?.[cell] ?? "").trim(),
    grid: (prefix) => {
      const re = new RegExp(`^${prefix}_[C-Z]\\d+$`);
      return Object.entries(eData).some(([ref, v]) => re.test(ref) && Number(v) > 0);
    },
    rows: (section) => readEsgGridRows(workbook.sections?.[section]?.cells as Record<string, unknown> | undefined, section),
    hasInventory: computeGhgInventory(workbook).hasData,
  };

  const counts: Record<EsgIndicatorStatus, number> = { full: 0, partial: 0, missing: 0, zero: 0, excluded: 0 };
  let pointsAwaitingData = 0;

  const pillars = (["environmental", "social", "governance"] as EsgScorecardPillar[]).map((pillar) => {
    const result = scored[pillar];
    const indicators = SCORECARD_INDICATORS[pillar].map((def): EsgIndicatorCoverage => {
      const spec = SPECS[pillar][def.key] ?? { meaning: "", needs: [] };
      const points = result.rows[def.key] ?? 0;
      const exclusion = result.excluded.find((x) => x.key === def.key);
      const missing = spec.needs.filter((n) => !n.optional && !n.has(ctx)).map((n) => n.label);
      const optional = spec.needs.filter((n) => n.optional && !n.has(ctx)).map((n) => n.label);
      const status: EsgIndicatorStatus = exclusion
        ? "excluded"
        : points >= def.maxPoints - 1e-9
          ? "full"
          : points > 0
            ? "partial"
            : missing.length > 0
              ? "missing"
              : "zero";
      counts[status] += 1;
      if (status === "missing") pointsAwaitingData += def.maxPoints;
      return {
        pillar,
        key: def.key,
        indicator: def.indicator,
        meaning: spec.meaning,
        points,
        maxPoints: def.maxPoints,
        status,
        missing: status === "missing" || status === "excluded" ? missing : [],
        optional,
        ...(exclusion ? { excludedReason: exclusion.reason, excludedFixable: FIXABLE_EXCLUSION.test(exclusion.reason) } : {}),
        topic: topicFor(pillar, def.key),
      };
    });
    return {
      pillar,
      score: result.score,
      denominator: result.scoringDenominator,
      percent: result.scoringDenominator > 0 ? result.score / result.scoringDenominator : 0,
      indicators,
    };
  });

  const [e, s, g] = pillars;
  return {
    overallPercent: esgOverallPercent(e.score, s.score, g.score, {
      environmental: e.denominator,
      social: s.denominator,
      governance: g.denominator,
    }),
    pillars,
    counts,
    pointsAwaitingData,
  };
}

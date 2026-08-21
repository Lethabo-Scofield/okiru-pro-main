/**
 * Glass HTML toolkit navigation tree — pillar-btn + sub-btn hierarchy.
 * Maps routes → workbook section keys for inline editing.
 */
import type { EsgScorecardResult } from "../../../EsgToolkit/src/lib/calculators";
import { sumIndicatorMaxPoints, type EsgScorecardPillar } from "./esgScorecardDefinitions";

export type EsgToolkitPillar = "e" | "s" | "g" | "overview" | "data";

export type EsgToolkitScoreGroup = {
  pillar: EsgScorecardPillar;
  /** Indicator row keys owned by this page — the membership definition. */
  keys: string[];
  /**
   * Σ of the members' column-B maxima. Always DERIVED via `scoreGroup()` below,
   * never typed by hand. Optional only for backwards compatibility with
   * consumers that read it defensively.
   */
  max?: number;
};

/**
 * Build a nav score group, deriving `max` from the indicator ledger in
 * `esgScorecardDefinitions.ts` (the single source of truth, transcribed from
 * `<Pillar>_Scorecard!B{row}`).
 *
 * `max` used to be a hand-typed literal on every sub-section — a fourth copy of
 * the points allocation, drifting independently of the definitions, the
 * dashboard table, and the pillar-max constants. Now the literals are gone and
 * `keys` alone defines the group; an unknown key throws instead of silently
 * shrinking the badge denominator.
 */
function scoreGroup(pillar: EsgScorecardPillar, keys: string[]): EsgToolkitScoreGroup {
  return { pillar, keys, max: sumIndicatorMaxPoints(pillar, keys) };
}

export type EsgToolkitNavSubItem = {
  id: string;
  label: string;
  href: string;
  sectionKey?: string;
  subtabId?: string;
  visibleSubtabs?: string[];
  scoreGroup?: EsgToolkitScoreGroup;
  sheet?: string;
  description?: string;
};

export type EsgToolkitNavItem = {
  id: string;
  label: string;
  href: string;
  pillar: EsgToolkitPillar;
  scoreKey?: "environmental" | "social" | "governance";
  children?: EsgToolkitNavSubItem[];
  /** Top-level overview routes without children */
  overview?: boolean;
};

export type EsgToolkitPageConfig = EsgToolkitNavSubItem & {
  eyebrow: string;
  pillar: EsgToolkitPillar;
  showPillarScorecard?: boolean;
};

const E_GHG_SUBTABS = ["scope-1a", "scope-1b", "scope-1c", "scope-1d", "scope-2", "ghg-summary", "nz-targets"];
const E_ENERGY_SUBTABS = ["scope-2", "solar"];

/** Overview section (no pillar header in nav). */
export const ESG_TOOLKIT_OVERVIEW_NAV: EsgToolkitNavItem[] = [
  { id: "dashboard", label: "ESG Dashboard", href: "/", pillar: "overview", overview: true },
  { id: "net-zero", label: "Net-Zero Roadmap", href: "/net-zero", pillar: "overview", overview: true },
  { id: "carbon-tax", label: "Carbon Tax", href: "/carbon-tax", pillar: "overview", overview: true },
  { id: "bbbee-bridge", label: "B-BBEE Bridge", href: "/bbbee-bridge", pillar: "overview", overview: true },
];

/** Pillar groups with sub-navigation (glass HTML order). */
export const ESG_TOOLKIT_PILLAR_NAV: EsgToolkitNavItem[] = [
  {
    id: "environmental",
    label: "E Dashboard",
    href: "/environmental",
    pillar: "e",
    scoreKey: "environmental",
    children: [
      {
        id: "e-ghg",
        label: "GHG Emissions",
        href: "/environmental/ghg",
        sectionKey: "e-data",
        visibleSubtabs: E_GHG_SUBTABS,
        sheet: "E_Data",
        scoreGroup: scoreGroup("environmental", ["d5", "d6", "d7", "d8", "d9"]),
        description: "Scope 1/2/3 summary and monthly emission inputs.",
      },
      {
        id: "e-energy",
        label: "Energy",
        href: "/environmental/energy",
        sectionKey: "e-data",
        visibleSubtabs: E_ENERGY_SUBTABS,
        sheet: "E_Data",
        scoreGroup: scoreGroup("environmental", ["d11", "d12", "d13"]),
        description: "Electricity and onsite solar generation.",
      },
      {
        id: "e-fleet",
        label: "Fleet",
        href: "/environmental/fleet",
        sectionKey: "fleet",
        sheet: "Fleet_Register",
        scoreGroup: scoreGroup("environmental", ["d15", "d16", "d17"]),
        description: "Per-vehicle fuel norms and fleet register.",
      },
      {
        id: "e-waste",
        label: "Waste",
        href: "/environmental/waste",
        sectionKey: "waste",
        sheet: "Waste_Register",
        scoreGroup: scoreGroup("environmental", ["d19", "d20", "d21"]),
        description: "Waste streams, diversion rate, and landfill tCO₂e.",
      },
      {
        id: "e-water",
        label: "Water",
        href: "/environmental/water",
        sectionKey: "e-data",
        subtabId: "water",
        visibleSubtabs: ["water"],
        sheet: "E_Data",
        scoreGroup: scoreGroup("environmental", ["d23", "d24"]),
        description: "Scope 3 water consumption by depot.",
      },
      {
        id: "e-iso",
        label: "ISO 14001 / ISO Tracker",
        href: "/environmental/iso",
        sectionKey: "iso-tracker",
        sheet: "ISO_Tracker",
        scoreGroup: scoreGroup("environmental", ["d26", "d27", "d28", "d29"]),
        description: "ISO 14001 clause tracker and environmental management.",
      },
    ],
  },
  {
    id: "social",
    label: "S Dashboard",
    href: "/social",
    pillar: "s",
    scoreKey: "social",
    children: [
      {
        id: "s-mc",
        label: "Management Control",
        href: "/social/management",
        sectionKey: "ee",
        sheet: "EE_Scorecard",
        scoreGroup: scoreGroup("social", ["d5", "d6", "d7", "d8", "d9", "d10"]),
        description: "EE scorecard bridge — EEA2 headcount and MC indicators.",
      },
      {
        id: "s-wsp",
        label: "WSP / ATR",
        href: "/social/wsp",
        sectionKey: "s-data",
        subtabId: "training",
        visibleSubtabs: ["training", "payroll"],
        sheet: "S_Data",
        scoreGroup: scoreGroup("social", ["d12", "d13", "d14", "d15"]),
        description: "Workplace skills plan, ATR, and leviable payroll.",
      },
      {
        id: "s-hs",
        label: "Health & Safety",
        href: "/social/health-safety",
        sectionKey: "s-data",
        subtabId: "hs",
        visibleSubtabs: ["hs"],
        sheet: "S_Data",
        scoreGroup: scoreGroup("social", ["d17", "d18", "d19", "d20"]),
        description: "LTIFR, fatalities, fatigue programme, and incidents.",
      },
      {
        id: "s-csi",
        label: "Community / CSI",
        href: "/social/community",
        sectionKey: "s-data-csi",
        sheet: "S_Data",
        scoreGroup: scoreGroup("social", ["d22", "d23", "d24", "d26", "d27"]),
        description: "Community investment, social calendar, and supplier compliance.",
      },
    ],
  },
  {
    id: "governance",
    label: "G Dashboard",
    href: "/governance",
    pillar: "g",
    scoreKey: "governance",
    children: [
      {
        id: "g-board",
        label: "Board Composition",
        href: "/governance/board",
        sectionKey: "g-data",
        sheet: "G_Data",
        // NO scoreGroup — deliberate, not an omission.
        //
        // G_Scorecard has 14 scored rows (A5:B25) and all 14 are already claimed
        // by the four groups below: g-king5 (d5,d6,d7) + g-ifrs (d9,d10) +
        // g-garp (d12,d14) + g-ethics (d16,d17,d19,d20,d22,d24,d25) = 14 of 14,
        // Σ 35+15+13+37 = 100. The ledger assigns this page nothing left to own.
        //
        // Board Composition is a pure INPUT page: it edits the G_Data maturity
        // column (F5, F13–F21, F23) whose values are scored on the pages above —
        // e.g. G_Data!F13 feeds `d6` (Social & Ethics Committee), scored under
        // King V, and F21/F23 feed `d12`/`d24`, scored under GARP and Ethics.
        // Giving it a score group would double-count those points against the
        // pillar total, which the single-source-of-truth invariant test forbids.
        // A nav badge of "—" here is correct.
        description: "Board diversity and governance maturity inputs.",
      },
      {
        id: "g-king5",
        label: "King V",
        href: "/governance/king5",
        sectionKey: "king5",
        sheet: "King5_Scorecard",
        scoreGroup: scoreGroup("governance", ["d5", "d6", "d7"]),
        description: "17 King V principles — Apply & Explain scoring.",
      },
      {
        id: "g-ifrs",
        label: "IFRS S1/S2",
        href: "/governance/ifrs",
        sectionKey: "ifrs",
        sheet: "IFRS_S1_S2",
        scoreGroup: scoreGroup("governance", ["d9", "d10"]),
        description: "Climate-related financial disclosures.",
      },
      {
        id: "g-garp",
        label: "GARP / ERM",
        href: "/governance/garp",
        sectionKey: "garp",
        sheet: "GARP_GRAP",
        scoreGroup: scoreGroup("governance", ["d12", "d14"]),
        description: "ESG risk register and GRAP public interest.",
      },
      {
        id: "g-ethics",
        label: "Ethics & Compliance",
        href: "/governance/ethics",
        sectionKey: "g-data",
        sheet: "G_Data",
        scoreGroup: scoreGroup("governance", ["d16", "d17", "d19", "d20", "d22", "d24", "d25"]),
        description: "Code of ethics, POPIA, transparency, and compliance.",
      },
    ],
  },
];

export const ESG_TOOLKIT_DATA_NAV: EsgToolkitNavItem[] = [
  { id: "import", label: "Data Import", href: "/import", pillar: "data" },
];

export const ESG_TOOLKIT_NAV_TREE: EsgToolkitNavItem[] = [
  ...ESG_TOOLKIT_OVERVIEW_NAV,
  ...ESG_TOOLKIT_PILLAR_NAV,
  ...ESG_TOOLKIT_DATA_NAV,
];

/** Pillar dashboard routes (glass HTML `e-dash` / `s-dash` / `g-dash` parity). */
export const ESG_TOOLKIT_PILLAR_HREFS = {
  environmental: "/environmental",
  social: "/social",
  governance: "/governance",
} as const;

export type EsgToolkitPillarScoreKey = keyof typeof ESG_TOOLKIT_PILLAR_HREFS;

export function toolkitPillarHref(
  pillar: EsgToolkitPillarScoreKey,
): (typeof ESG_TOOLKIT_PILLAR_HREFS)[EsgToolkitPillarScoreKey] {
  return ESG_TOOLKIT_PILLAR_HREFS[pillar];
}

/** Flat list of every registered toolkit href (for route tests). */
export function allToolkitHrefs(): string[] {
  const hrefs = new Set<string>();
  for (const item of ESG_TOOLKIT_NAV_TREE) {
    hrefs.add(item.href);
    item.children?.forEach((c) => hrefs.add(c.href));
  }
  return [...hrefs].sort();
}

export function toolkitPageByHref(href: string): EsgToolkitPageConfig | undefined {
  for (const pillar of ESG_TOOLKIT_PILLAR_NAV) {
    const child = pillar.children?.find((c) => c.href === href);
    if (child) {
      return {
        ...child,
        eyebrow: pillar.label.replace(" Dashboard", ""),
        pillar: pillar.pillar,
      };
    }
  }
  return undefined;
}

export function toolkitSectionKeyForRoute(href: string): string | undefined {
  return toolkitPageByHref(href)?.sectionKey;
}

export function sumScoreGroup(
  scorecard: EsgScorecardResult | null,
  group?: EsgToolkitScoreGroup,
): number | null {
  if (!scorecard || !group) return null;
  const rows =
    group.pillar === "environmental"
      ? scorecard.environmentalRows
      : group.pillar === "social"
        ? scorecard.socialRows
        : scorecard.governanceRows;
  return group.keys.reduce((sum, key) => sum + (rows[key] ?? 0), 0);
}

export function formatNavBadge(score: number | null, max?: number): string {
  if (score == null) return "—";
  if (max != null) return `${score.toFixed(0)}/${max}`;
  return score.toFixed(0);
}

export function pillarAccentClass(pillar: EsgToolkitPillar, active: boolean): string {
  if (!active) return "border-transparent";
  switch (pillar) {
    case "e":
      return "border-[var(--esg-acc-e)] bg-[rgba(29,233,160,0.06)]";
    case "s":
      return "border-[var(--esg-acc-s)] bg-[rgba(245,166,35,0.06)]";
    case "g":
      return "border-[var(--esg-acc-g)] bg-[rgba(155,107,255,0.06)]";
    case "data":
      return "border-[var(--esg-acc-blue,#4aa8ff)] bg-[rgba(74,168,255,0.06)]";
    default:
      return "border-[var(--esg-acc-e)] bg-white/[0.04]";
  }
}

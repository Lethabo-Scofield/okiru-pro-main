/**
 * Glass HTML toolkit navigation tree — pillar-btn + sub-btn hierarchy.
 * Maps routes → workbook section keys for inline editing.
 */
import type { EsgScorecardResult } from "../../../EsgToolkit/src/lib/calculators";

export type EsgToolkitPillar = "e" | "s" | "g" | "overview" | "data";

export type EsgToolkitScoreGroup = {
  pillar: "environmental" | "social" | "governance";
  keys: string[];
  max?: number;
};

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
        scoreGroup: { pillar: "environmental", keys: ["d5", "d6", "d7", "d8", "d9"], max: 33 },
        description: "Scope 1/2/3 summary and monthly emission inputs.",
      },
      {
        id: "e-energy",
        label: "Energy",
        href: "/environmental/energy",
        sectionKey: "e-data",
        visibleSubtabs: E_ENERGY_SUBTABS,
        sheet: "E_Data",
        scoreGroup: { pillar: "environmental", keys: ["d11", "d12", "d13"], max: 18 },
        description: "Electricity and onsite solar generation.",
      },
      {
        id: "e-fleet",
        label: "Fleet",
        href: "/environmental/fleet",
        sectionKey: "fleet",
        sheet: "Fleet_Register",
        scoreGroup: { pillar: "environmental", keys: ["d15", "d16", "d17"], max: 18 },
        description: "Per-vehicle fuel norms and fleet register.",
      },
      {
        id: "e-waste",
        label: "Waste",
        href: "/environmental/waste",
        sectionKey: "waste",
        sheet: "Waste_Register",
        scoreGroup: { pillar: "environmental", keys: ["d19", "d20", "d21"], max: 12 },
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
        scoreGroup: { pillar: "environmental", keys: ["d23", "d24"], max: 7 },
        description: "Scope 3 water consumption by depot.",
      },
      {
        id: "e-iso",
        label: "ISO 14001 / ISO Tracker",
        href: "/environmental/iso",
        sectionKey: "iso-tracker",
        sheet: "ISO_Tracker",
        scoreGroup: { pillar: "environmental", keys: ["d26", "d27", "d28", "d29"], max: 20 },
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
        scoreGroup: { pillar: "social", keys: ["d5", "d6", "d7", "d8", "d9", "d10"], max: 30 },
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
        scoreGroup: { pillar: "social", keys: ["d12", "d13", "d14", "d15"], max: 20 },
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
        scoreGroup: { pillar: "social", keys: ["d17", "d18", "d19", "d20"], max: 25 },
        description: "LTIFR, fatalities, fatigue programme, and incidents.",
      },
      {
        id: "s-csi",
        label: "Community / CSI",
        href: "/social/community",
        sectionKey: "s-data-csi",
        sheet: "S_Data",
        scoreGroup: { pillar: "social", keys: ["d22", "d23", "d24", "d26", "d27"], max: 25 },
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
        description: "Board diversity and governance maturity inputs.",
      },
      {
        id: "g-king5",
        label: "King V",
        href: "/governance/king5",
        sectionKey: "king5",
        sheet: "King5_Scorecard",
        scoreGroup: { pillar: "governance", keys: ["d5", "d6", "d7"], max: 35 },
        description: "17 King V principles — Apply & Explain scoring.",
      },
      {
        id: "g-ifrs",
        label: "IFRS S1/S2",
        href: "/governance/ifrs",
        sectionKey: "ifrs",
        sheet: "IFRS_S1_S2",
        scoreGroup: { pillar: "governance", keys: ["d9", "d10"], max: 15 },
        description: "Climate-related financial disclosures.",
      },
      {
        id: "g-garp",
        label: "GARP / ERM",
        href: "/governance/garp",
        sectionKey: "garp",
        sheet: "GARP_GRAP",
        scoreGroup: { pillar: "governance", keys: ["d12", "d14"], max: 13 },
        description: "ESG risk register and GRAP public interest.",
      },
      {
        id: "g-ethics",
        label: "Ethics & Compliance",
        href: "/governance/ethics",
        sectionKey: "g-data",
        sheet: "G_Data",
        scoreGroup: { pillar: "governance", keys: ["d16", "d17", "d19", "d20", "d22", "d24", "d25"], max: 37 },
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

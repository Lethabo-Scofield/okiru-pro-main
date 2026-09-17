/**
 * Part 4 — Report by Topic (ported from the ESG_Upgrade handover).
 *
 * Voluntary reporters pick plain-language topics instead of framework-aligned
 * everything. A "topic" here is deliberately the same thing as a toolkit
 * sub-nav item (e-ghg, s-mc, g-king5, …) — one tagging system, two entry
 * points, exactly like the glass-HTML prototype reused its bucket ids.
 *
 * Scope state persists in the workbook's `assumptions` section cells
 * (same mechanism as stance B6 / `_submittedAt`), so it is server-backed
 * per company rather than in-memory like the prototype.
 */
import {
  ESG_TOOLKIT_PILLAR_NAV,
  sumScoreGroup,
  type EsgToolkitPillarScoreKey,
} from "./esgToolkitNav";
import type { EsgScorecardResult } from "../../../EsgToolkit/src/lib/calculators";

export type EsgReportMode = "framework" | "topic";

export const ESG_REPORT_MODE_CELL = "_reportMode";
export const ESG_SELECTED_TOPICS_CELL = "_selectedTopics";

export type EsgTopicOption = { id: string; label: string; description?: string };
export type EsgTopicPillarGroup = {
  pillar: EsgToolkitPillarScoreKey;
  label: string;
  accentVar: string;
  topics: EsgTopicOption[];
};

const PILLAR_ACCENT_VARS: Record<EsgToolkitPillarScoreKey, string> = {
  environmental: "--esg-acc-e",
  social: "--esg-acc-s",
  governance: "--esg-acc-g",
};

const PILLAR_LABELS: Record<EsgToolkitPillarScoreKey, string> = {
  environmental: "Environmental",
  social: "Social",
  governance: "Governance",
};

/** Pillar-grouped topic picker options, derived from the nav tree so the two can never drift. */
export const ESG_TOPIC_PILLARS: EsgTopicPillarGroup[] = ESG_TOOLKIT_PILLAR_NAV.map((pillar) => {
  const key = pillar.scoreKey as EsgToolkitPillarScoreKey;
  return {
    pillar: key,
    label: PILLAR_LABELS[key],
    accentVar: PILLAR_ACCENT_VARS[key],
    topics: (pillar.children ?? []).map((c) => ({
      id: c.id,
      label: c.label,
      description: c.description,
    })),
  };
});

export const ALL_ESG_TOPIC_IDS: string[] = ESG_TOPIC_PILLARS.flatMap((g) =>
  g.topics.map((t) => t.id),
);

const TOPIC_ID_SET = new Set(ALL_ESG_TOPIC_IDS);

const TOPIC_PILLAR_BY_ID = new Map<string, EsgToolkitPillarScoreKey>(
  ESG_TOPIC_PILLARS.flatMap((g) => g.topics.map((t) => [t.id, g.pillar] as const)),
);

export function parseReportMode(raw: unknown): EsgReportMode {
  return raw === "topic" ? "topic" : "framework";
}

/** Absent/blank → comprehensive by default: every topic selected (the person opts out, not in). */
export function parseSelectedTopics(raw: unknown): string[] {
  if (typeof raw !== "string" || raw.trim() === "") return [...ALL_ESG_TOPIC_IDS];
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => TOPIC_ID_SET.has(s));
  return ids.length ? ids : [...ALL_ESG_TOPIC_IDS];
}

export function serializeSelectedTopics(ids: string[]): string {
  return ALL_ESG_TOPIC_IDS.filter((id) => ids.includes(id)).join(",");
}

export type EsgReportScope = { mode: EsgReportMode; selectedTopics: string[] };

/** Read scope straight off assumptions cells — usable outside the store (e.g. Summary fetches the workbook itself). */
export function readReportScopeFromCells(
  cells: Record<string, unknown> | undefined | null,
): EsgReportScope {
  return {
    mode: parseReportMode(cells?.[ESG_REPORT_MODE_CELL]),
    selectedTopics: parseSelectedTopics(cells?.[ESG_SELECTED_TOPICS_CELL]),
  };
}

function pillarHasSelectedTopic(pillar: EsgToolkitPillarScoreKey, selected: string[]): boolean {
  return selected.some((id) => TOPIC_PILLAR_BY_ID.get(id) === pillar);
}

/**
 * Nav visibility in topic mode. Mirrors the handover's rules at this app's
 * granularity: the named-standard cross-reference (B-BBEE Bridge) is hidden
 * outright; Net-Zero and Carbon Tax ride along with GHG the way "levers"
 * rode along with "climate"; Dashboard and Import are never topic-specific.
 */
export function topicNavVisibility(id: string, mode: EsgReportMode, selected: string[]): boolean {
  if (mode !== "topic") return true;
  if (id === "bbbee-bridge") return false;
  if (id === "net-zero" || id === "carbon-tax") return selected.includes("e-ghg");
  if (id === "environmental") return pillarHasSelectedTopic("environmental", selected);
  if (id === "social") return pillarHasSelectedTopic("social", selected);
  if (id === "governance") return pillarHasSelectedTopic("governance", selected);
  if (TOPIC_ID_SET.has(id)) return selected.includes(id);
  return true;
}

export type EsgScopedPillar = { score: number; max: number };
export type EsgScopedSummary = {
  pillars: Record<EsgToolkitPillarScoreKey, EsgScopedPillar>;
  overallScore: number;
  overallMax: number;
  overallPercent: number;
  selectedCount: number;
  totalCount: number;
};

/**
 * Display-layer scoping: sums only the selected topics' score groups. The
 * full-parity scorecard (calculators + golden fixtures) is never modified —
 * this is a view over it, so framework-mode numbers and exports stay exact.
 */
export function computeScopedSummary(
  scorecard: EsgScorecardResult | null,
  selected: string[],
): EsgScopedSummary | null {
  if (!scorecard) return null;
  const pillars: Record<EsgToolkitPillarScoreKey, EsgScopedPillar> = {
    environmental: { score: 0, max: 0 },
    social: { score: 0, max: 0 },
    governance: { score: 0, max: 0 },
  };
  for (const pillar of ESG_TOOLKIT_PILLAR_NAV) {
    const key = pillar.scoreKey as EsgToolkitPillarScoreKey;
    for (const child of pillar.children ?? []) {
      if (!child.scoreGroup || !selected.includes(child.id)) continue;
      const score = sumScoreGroup(scorecard, child.scoreGroup);
      pillars[key].score += score ?? 0;
      pillars[key].max += child.scoreGroup.max ?? 0;
    }
  }
  const overallScore =
    pillars.environmental.score + pillars.social.score + pillars.governance.score;
  const overallMax = pillars.environmental.max + pillars.social.max + pillars.governance.max;
  return {
    pillars,
    overallScore,
    overallMax,
    // 0–1 fraction, matching EsgScorecardResult.overallPercent. Every consumer
    // renders these two interchangeably through formatEsgPercent(), which
    // multiplies by 100 — returning 0–100 here showed "4461.8%" in topic mode.
    overallPercent: overallMax > 0 ? overallScore / overallMax : 0,
    selectedCount: selected.length,
    totalCount: ALL_ESG_TOPIC_IDS.length,
  };
}

/** "8 of 15 topics selected — you're not committing to any named standard." */
export function topicCounterLine(selected: string[]): string {
  return `${selected.length} of ${ALL_ESG_TOPIC_IDS.length} topics selected — you're not committing to any named standard.`;
}

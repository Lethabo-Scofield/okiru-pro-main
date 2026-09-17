import type React from "react";
import { useMemo } from "react";
import { useLocation, Link } from "wouter";
import { cn } from "@toolkit/lib/utils";
import { formatEsgPercent } from "@/lib/esgCalculators";
import {
  ESG_TOOLKIT_DATA_NAV,
  ESG_TOOLKIT_OVERVIEW_NAV,
  ESG_TOOLKIT_PILLAR_NAV,
  ESG_TOOLKIT_PILLAR_HREFS,
  formatNavBadge,
  pillarAccentClass,
  sumScoreGroup,
  type EsgToolkitNavItem,
  type EsgToolkitNavSubItem,
  type EsgToolkitPillar,
} from "@/lib/esg/esgToolkitNav";
import {
  ESG_SELECTED_TOPICS_CELL,
  computeScopedSummary,
  parseSelectedTopics,
  topicNavVisibility,
} from "@/lib/esg/esgTopicScope";
import { useEsgStore } from "../../lib/esgStore";

function isActivePath(location: string, href: string): boolean {
  if (href === "/") return location === "/" || location === "";
  return location === href || location.startsWith(`${href}/`);
}

function pillarScoreBadge(
  scoreKey: EsgToolkitNavItem["scoreKey"],
  scorecard: ReturnType<typeof useEsgStore.getState>["scorecard"],
): string {
  if (!scoreKey || !scorecard) return "—";
  return scorecard[scoreKey].score.toFixed(0);
}

function subScoreBadge(
  scorecard: ReturnType<typeof useEsgStore.getState>["scorecard"],
  sub: EsgToolkitNavSubItem,
): string {
  const score = sumScoreGroup(scorecard, sub.scoreGroup);
  return formatNavBadge(score, sub.scoreGroup?.max);
}

function NavSubButton({
  sub,
  location,
  activeParent,
}: {
  sub: EsgToolkitNavSubItem;
  location: string;
  activeParent: boolean;
}) {
  const scorecard = useEsgStore((s) => s.scorecard);
  const active = isActivePath(location, sub.href);

  return (
    <Link
      href={sub.href}
      className={cn(
        "flex items-center gap-1.5 pl-8 pr-3.5 py-1.5 text-[11px] w-full border-l-2 transition-colors",
        active || activeParent
          ? "text-[var(--esg-text)] bg-white/[0.04] border-transparent"
          : "text-[var(--esg-text3)] border-transparent hover:bg-white/[0.02] hover:text-[var(--esg-text2)]",
        active && "bg-white/[0.04] text-[var(--esg-text)]",
      )}
      data-testid={`esg-nav-${sub.id}`}
    >
      <span className="truncate">{sub.label}</span>
      {sub.scoreGroup ? (
        <span
          className={cn(
            "ml-auto text-[9px] font-semibold tabular-nums",
            active ? "opacity-100" : "opacity-60",
          )}
        >
          {subScoreBadge(scorecard, sub)}
        </span>
      ) : null}
    </Link>
  );
}

function NavPillarButton({
  item,
  location,
}: {
  item: EsgToolkitNavItem;
  location: string;
}) {
  const scorecard = useEsgStore((s) => s.scorecard);
  const pillarActive =
    isActivePath(location, item.href) ||
    Boolean(item.children?.some((c) => isActivePath(location, c.href)));
  const childActive = item.children?.some((c) => isActivePath(location, c.href));

  const accentStyle: React.CSSProperties | undefined =
    item.pillar === "e"
      ? {
          color: "var(--esg-acc-e)",
          borderColor: "rgba(29,233,160,.25)",
          background: "rgba(29,233,160,.08)",
        }
      : item.pillar === "s"
        ? {
            color: "var(--esg-acc-s)",
            borderColor: "rgba(245,166,35,.25)",
            background: "rgba(245,166,35,.08)",
          }
        : item.pillar === "g"
          ? {
              color: "var(--esg-acc-g)",
              borderColor: "rgba(155,107,255,.25)",
              background: "rgba(155,107,255,.08)",
            }
          : item.pillar === "data"
            ? {
                color: "var(--esg-acc-blue,#4aa8ff)",
                borderColor: "rgba(74,168,255,.25)",
                background: "rgba(74,168,255,.08)",
              }
            : undefined;

  return (
    <div>
      <Link
        href={item.href}
        className={cn(
          "flex items-center gap-2 px-3.5 py-2 text-[12px] w-full border-l-2 transition-colors font-medium",
          pillarActive
            ? cn("text-[var(--esg-text)]", pillarAccentClass(item.pillar, true))
            : "text-[var(--esg-text2)] border-transparent hover:bg-white/[0.03] hover:text-[var(--esg-text)]",
        )}
        data-testid={`esg-nav-${item.id}`}
      >
        <span className="truncate">{item.label}</span>
        {item.scoreKey ? (
          <span
            className="ml-auto text-[9px] font-bold tabular-nums px-1.5 py-0.5 rounded-lg border"
            style={accentStyle}
          >
            {pillarScoreBadge(item.scoreKey, scorecard)}
          </span>
        ) : null}
      </Link>
      {item.children?.map((sub) => (
        <NavSubButton
          key={sub.id}
          sub={sub}
          location={location}
          activeParent={pillarActive && !childActive && isActivePath(location, item.href)}
        />
      ))}
    </div>
  );
}

function NavOverviewLink({ item, location }: { item: EsgToolkitNavItem; location: string }) {
  const active = isActivePath(location, item.href);
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2 px-3.5 py-2 text-[12px] w-full border-l-2 transition-colors",
        active
          ? cn("text-[var(--esg-text)]", pillarAccentClass("overview", true))
          : "text-[var(--esg-text2)] border-transparent hover:bg-white/[0.03] hover:text-[var(--esg-text)]",
      )}
      data-testid={`esg-nav-${item.id}`}
    >
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function NavSectionHeader({
  title,
  href,
}: {
  title: string;
  href?: string;
}) {
  const label = (
    <span className="px-4 pt-4 pb-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--esg-text3)] block">
      {title}
    </span>
  );
  if (!href) return label;
  return (
    <Link
      href={href}
      className="block hover:text-[var(--esg-text2)] transition-colors"
      data-testid={`esg-nav-section-${title.toLowerCase()}`}
    >
      {label}
    </Link>
  );
}

function NavDivider() {
  return <div className="h-px bg-[var(--esg-glass-border)] mx-3 my-2" />;
}

const PILLAR_SECTION_TITLES: Record<EsgToolkitPillar, string> = {
  e: "Environmental",
  s: "Social",
  g: "Governance",
  overview: "Overview",
  data: "Data",
};

export function EsgSidebar() {
  const [location] = useLocation();
  const scorecard = useEsgStore((s) => s.scorecard);
  const reportMode = useEsgStore((s) => s.getReportMode());
  // Select the raw CSV cell (a stable primitive) — getSelectedTopics() builds a
  // fresh array per call, which as a zustand selector re-renders forever.
  const topicsCsv = useEsgStore(
    (s) => s.workbook?.sections?.assumptions?.cells?.[ESG_SELECTED_TOPICS_CELL],
  );
  const selectedTopics = useMemo(() => parseSelectedTopics(topicsCsv), [topicsCsv]);

  const inScope = (id: string) => topicNavVisibility(id, reportMode, selectedTopics);
  const scoped = useMemo(
    () => (reportMode === "topic" ? computeScopedSummary(scorecard, selectedTopics) : null),
    [reportMode, scorecard, selectedTopics],
  );

  return (
    <nav
      className="w-[var(--esg-nav-w)] shrink-0 border-r border-[var(--esg-glass-border)] bg-[rgba(8,14,20,0.6)] backdrop-blur-xl overflow-y-auto py-3"
      data-testid="esg-sidebar"
    >
      <NavSectionHeader title="Overview" />
      {ESG_TOOLKIT_OVERVIEW_NAV.filter((item) => inScope(item.id)).map((item) => (
        <NavOverviewLink key={item.id} item={item} location={location} />
      ))}

      {ESG_TOOLKIT_PILLAR_NAV.filter((pillar) => inScope(pillar.id)).map((pillar) => {
        const visiblePillar: EsgToolkitNavItem = {
          ...pillar,
          children: pillar.children?.filter((c) => inScope(c.id)),
        };
        return (
          <div key={pillar.id}>
            <NavDivider />
            <NavSectionHeader
              title={PILLAR_SECTION_TITLES[pillar.pillar]}
              href={
                pillar.pillar === "e"
                  ? ESG_TOOLKIT_PILLAR_HREFS.environmental
                  : pillar.pillar === "s"
                    ? ESG_TOOLKIT_PILLAR_HREFS.social
                    : pillar.pillar === "g"
                      ? ESG_TOOLKIT_PILLAR_HREFS.governance
                      : undefined
              }
            />
            <NavPillarButton item={visiblePillar} location={location} />
          </div>
        );
      })}

      <NavDivider />
      <NavSectionHeader title="Data" />
      {ESG_TOOLKIT_DATA_NAV.filter((item) => inScope(item.id)).map((item) => (
        <NavPillarButton key={item.id} item={item} location={location} />
      ))}

      {scorecard ? (
        <div className="px-4 pt-5 pb-2">
          <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--esg-text3)] mb-2">
            Live totals
          </div>
          <div className="text-[11px] text-[var(--esg-text2)] tabular-nums">
            {scoped
              ? `In scope ${formatEsgPercent(scoped.overallPercent)}`
              : `Overall ${formatEsgPercent(scorecard.overallPercent)}`}
          </div>
          {scoped ? (
            <div
              className="text-[10px] text-[var(--esg-text3)] mt-1 tabular-nums"
              data-testid="esg-sidebar-topic-count"
            >
              {scoped.selectedCount} of {scoped.totalCount} topics selected
            </div>
          ) : null}
        </div>
      ) : null}
    </nav>
  );
}

export { allToolkitHrefs } from "@/lib/esg/esgToolkitNav";

import { useLocation, Link } from "wouter";
import { cn } from "@toolkit/lib/utils";
import { esgCreateHref } from "@/lib/esgRoutes";
import { useEsgStore } from "../../lib/esgStore";

export type EsgNavItem = {
  id: string;
  label: string;
  href: string;
  pillar?: "e" | "s" | "g" | "overview" | "data";
  scoreKey?: "environmental" | "social" | "governance";
  externalWorkbook?: boolean;
};

const NAV_SECTIONS: { title: string; items: EsgNavItem[] }[] = [
  {
    title: "Overview",
    items: [
      { id: "dashboard", label: "Dashboard", href: "/", pillar: "overview" },
      { id: "net-zero", label: "Net-Zero Roadmap", href: "/net-zero", pillar: "overview" },
      { id: "carbon-tax", label: "Carbon Tax", href: "/carbon-tax", pillar: "overview" },
      { id: "bbbee-bridge", label: "B-BBEE Bridge", href: "/bbbee-bridge", pillar: "overview" },
      { id: "iso-14083", label: "ISO 14083", href: "/iso-14083", pillar: "e" },
    ],
  },
  {
    title: "Scorecards",
    items: [
      { id: "environmental", label: "E Scorecard", href: "/environmental", pillar: "e", scoreKey: "environmental" },
      { id: "social", label: "S Scorecard", href: "/social", pillar: "s", scoreKey: "social" },
      { id: "governance", label: "G Scorecard", href: "/governance", pillar: "g", scoreKey: "governance" },
    ],
  },
  {
    title: "Workbook",
    items: [
      { id: "edit-inputs", label: "Edit ESG inputs", href: "__workbook__", pillar: "data", externalWorkbook: true },
    ],
  },
];

function pillarAccent(pillar?: EsgNavItem["pillar"]): string {
  switch (pillar) {
    case "e":
      return "border-[var(--esg-acc-e)] bg-[rgba(29,233,160,0.06)]";
    case "s":
      return "border-[var(--esg-acc-s)] bg-[rgba(245,166,35,0.06)]";
    case "g":
      return "border-[var(--esg-acc-g)] bg-[rgba(155,107,255,0.06)]";
    default:
      return "border-[var(--esg-acc-e)] bg-white/[0.04]";
  }
}

export function EsgSidebar() {
  const [location] = useLocation();
  const scorecard = useEsgStore((s) => s.scorecard);
  const companyId = useEsgStore((s) => s.companyId);

  const isActive = (href: string) => {
    if (href === "/") return location === "/" || location === "";
    return location === href || location.startsWith(`${href}/`);
  };

  const badge = (key?: EsgNavItem["scoreKey"]) => {
    if (!key || !scorecard) return "—";
    const pts = scorecard[key].score;
    return `${pts.toFixed(0)}`;
  };

  const resolveHref = (item: EsgNavItem) => {
    if (item.externalWorkbook && companyId) return esgCreateHref(companyId);
    if (item.externalWorkbook) return "/esg/clients";
    return item.href;
  };

  return (
    <nav
      className="w-[var(--esg-nav-w)] shrink-0 border-r border-[var(--esg-glass-border)] bg-[rgba(8,14,20,0.6)] backdrop-blur-xl overflow-y-auto py-3"
      data-testid="esg-sidebar"
    >
      {NAV_SECTIONS.map((section) => (
        <div key={section.title}>
          <div className="px-4 pt-4 pb-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--esg-text3)]">
            {section.title}
          </div>
          {section.items.map((item) => {
            const href = resolveHref(item);
            const active = item.externalWorkbook ? false : isActive(item.href);
            return (
              <Link
                key={item.id}
                href={href}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2 text-[12px] w-full border-l-2 transition-colors",
                  active
                    ? cn("text-[var(--esg-text)]", pillarAccent(item.pillar))
                    : "text-[var(--esg-text2)] border-transparent hover:bg-white/[0.03] hover:text-[var(--esg-text)]",
                )}
                data-testid={`esg-nav-${item.id}`}
              >
                <span className="truncate">{item.label}</span>
                {item.scoreKey != null && (
                  <span className="ml-auto text-[9px] font-bold tabular-nums opacity-70">
                    {badge(item.scoreKey)}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
      {scorecard ? (
        <div className="px-4 pt-6 pb-2 space-y-2">
          <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--esg-text3)]">
            Pillar scores
          </div>
          {(
            [
              { key: "environmental" as const, label: "E", color: "var(--esg-acc-e)" },
              { key: "social" as const, label: "S", color: "var(--esg-acc-s)" },
              { key: "governance" as const, label: "G", color: "var(--esg-acc-g)" },
            ] as const
          ).map((p) => (
            <div key={p.key} className="flex justify-between text-[11px] text-[var(--esg-text2)]">
              <span>{p.label}</span>
              <span className="font-bold tabular-nums" style={{ color: p.color }}>
                {scorecard[p.key].score.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </nav>
  );
}

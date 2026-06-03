import { useLocation, Link } from "wouter";
import { cn } from "@toolkit/lib/utils";
import { useEsgStore } from "../../lib/esgStore";

export type EsgNavItem = {
  id: string;
  label: string;
  href: string;
  pillar?: "e" | "s" | "g" | "overview" | "data";
  scoreKey?: "environmental" | "social" | "governance";
};

const NAV_SECTIONS: { title: string; items: EsgNavItem[] }[] = [
  {
    title: "Overview",
    items: [
      { id: "dashboard", label: "Dashboard", href: "/", pillar: "overview" },
      { id: "net-zero", label: "Net-Zero Roadmap", href: "/net-zero", pillar: "overview" },
      { id: "carbon-tax", label: "Carbon Tax", href: "/carbon-tax", pillar: "overview" },
    ],
  },
  {
    title: "Environmental",
    items: [
      { id: "e-dashboard", label: "E Dashboard", href: "/environmental", pillar: "e", scoreKey: "environmental" },
      { id: "ghg", label: "GHG & Energy", href: "/ghg", pillar: "e" },
      { id: "fleet", label: "Fleet Register", href: "/fleet", pillar: "e" },
      { id: "waste", label: "Waste Register", href: "/waste", pillar: "e" },
      { id: "iso-14083", label: "ISO 14083", href: "/iso-14083", pillar: "e" },
    ],
  },
  {
    title: "Social",
    items: [
      { id: "s-dashboard", label: "S Dashboard", href: "/social", pillar: "s", scoreKey: "social" },
      { id: "ee", label: "EE Scorecard", href: "/ee-scorecard", pillar: "s" },
    ],
  },
  {
    title: "Governance",
    items: [
      { id: "g-dashboard", label: "G Dashboard", href: "/governance", pillar: "g", scoreKey: "governance" },
      { id: "king5", label: "King V", href: "/king5", pillar: "g" },
      { id: "ifrs", label: "IFRS S1/S2", href: "/ifrs", pillar: "g" },
      { id: "garp", label: "GARP/ERM", href: "/garp", pillar: "g" },
    ],
  },
  {
    title: "Data",
    items: [
      { id: "assumptions", label: "Assumptions", href: "/assumptions", pillar: "data" },
      { id: "import", label: "Data Import", href: "/import", pillar: "data" },
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

  const isActive = (href: string) => {
    if (href === "/") return location === "/" || location === "";
    return location === href || location.startsWith(`${href}/`);
  };

  const badge = (key?: EsgNavItem["scoreKey"]) => {
    if (!key || !scorecard) return "—";
    const pts = scorecard[key].score;
    return `${pts.toFixed(0)}`;
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
            const active = isActive(item.href);
            return (
              <Link
                key={item.id}
                href={item.href}
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
    </nav>
  );
}

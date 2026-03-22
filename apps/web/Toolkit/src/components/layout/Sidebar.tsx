import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  UserCog,
  Scale,
  BookOpen,
  ShoppingCart,
  HeartHandshake,
  Handshake,
  Settings,
  GitCompare,
  FileSpreadsheet,
  FileText,
  Calculator,
  LineChart,
  Table,
  ChevronDown,
} from "lucide-react";
import { cn } from "@toolkit/lib/utils";
import { useBbeeStore } from "@toolkit/lib/store";
import okiruLogo from "@toolkit-assets/Okiru_WHT_Circle_Logo_V1_1772658965196.png";

const mainNavItems = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Scorecard", href: "/scorecard", icon: Table },
  { name: "Import Excel", href: "/import", icon: FileSpreadsheet },
  { name: "Scenarios", href: "/scenarios", icon: GitCompare },
  { name: "Reports", href: "/reports", icon: FileText },
];

const dataInputItems = [
  { name: "Financials & TMPS", href: "/pillars/financials", icon: Calculator },
  { name: "Industry Norms", href: "/pillars/industry-norms", icon: LineChart },
];

const pillarItems = [
  { name: "Ownership", href: "/pillars/ownership", icon: Users, scoreKey: "ownership", target: 25, color: "text-violet-400", barFill: "bg-violet-400/60", dot: "bg-violet-400" },
  { name: "Management Control", href: "/pillars/management", icon: UserCog, scoreKey: "managementControl", target: 27, color: "text-blue-400", barFill: "bg-blue-400/60", dot: "bg-blue-400" },
  { name: "Employment Equity", href: "/pillars/employment-equity", icon: Scale, scoreKey: "managementControl", target: 27, color: "text-indigo-400", barFill: "bg-indigo-400/60", dot: "bg-indigo-400" },
  { name: "Skills Development", href: "/pillars/skills", icon: BookOpen, scoreKey: "skillsDevelopment", target: 25, color: "text-emerald-400", barFill: "bg-emerald-400/60", dot: "bg-emerald-400" },
  { name: "Enterprise & Supplier", href: "/pillars/esd", icon: Handshake, scoreKey: "enterpriseDevelopment", target: 42, color: "text-amber-400", barFill: "bg-amber-400/60", dot: "bg-amber-400" },
  { name: "Socio-Economic Dev", href: "/pillars/sed", icon: HeartHandshake, scoreKey: "socioEconomicDevelopment", target: 5, color: "text-sky-400", barFill: "bg-sky-400/60", dot: "bg-sky-400" },
];

function NavItem({ item, isActive }: { item: { name: string; href: string; icon: any }; isActive: boolean }) {
  return (
    <Link
      href={item.href}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium relative transition-all duration-150",
        isActive
          ? "bg-white/10 text-white"
          : "text-white/55 hover:text-white/90 hover:bg-white/6"
      )}
      data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary" />
      )}
      <item.icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors duration-150",
          isActive ? "text-primary" : "text-white/35 group-hover:text-white/65"
        )}
      />
      <span className="truncate flex-1 leading-snug">{item.name}</span>
    </Link>
  );
}

function PillarNavItem({ item, isActive }: { item: typeof pillarItems[0]; isActive: boolean }) {
  return (
    <Link
      href={item.href}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium relative transition-all duration-150",
        isActive
          ? "bg-white/10 text-white"
          : "text-white/55 hover:text-white/90 hover:bg-white/6"
      )}
      data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary" />
      )}
      <item.icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors duration-150",
          isActive ? "text-primary" : "text-white/35 group-hover:text-white/65"
        )}
      />
      <span className="truncate flex-1 leading-snug">{item.name}</span>
    </Link>
  );
}

function CollapsibleSection({
  label,
  children,
  defaultOpen = true,
}: {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="space-y-0.5">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center w-full px-3 pb-1 pt-3 tracking-widest uppercase hover:text-white/60 transition-colors duration-150"
        data-testid={`section-toggle-${label.toLowerCase().replace(/\s+/g, '-')}`}
      >
        {/* Bold, well-spaced section label */}
        <span className="flex-1 text-left text-[10px] font-bold text-white/35 tracking-[0.12em]">
          {label}
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 text-white/30 transition-transform duration-200",
            !isOpen && "-rotate-90"
          )}
        />
      </button>
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          isOpen ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        {children}
      </div>
    </div>
  );
}

function ScoreRing({ score, total }: { score: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (score / total) * 100) : 0;
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative h-12 w-12 flex items-center justify-center shrink-0">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 44 44">
        <circle
          cx="22" cy="22" r={radius}
          fill="none" strokeWidth="3"
          className="stroke-white/10"
        />
        <circle
          cx="22" cy="22" r={radius}
          fill="none" strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="stroke-primary transition-all duration-700 ease-out"
        />
      </svg>
      <div className="text-center z-10">
        <span className="text-[12px] font-bold tabular-nums leading-none text-white">
          {Math.round(score)}
        </span>
      </div>
    </div>
  );
}

export function Sidebar() {
  const [location] = useLocation();
  const scorecard = useBbeeStore(s => s.scorecard);
  const isLoaded = useBbeeStore(s => s.isLoaded);
  const totalScore = isLoaded && scorecard ? scorecard.total?.score || 0 : 0;
  const level = isLoaded && scorecard ? scorecard.discountedLevel : 9;
  const levelLabel = level >= 9 ? "N/C" : `L${level}`;

  return (
    <div className="flex h-screen w-[220px] flex-col bg-sidebar border-r border-white/8 z-10">

      {/* ── Header ── */}
      <div className="flex h-14 items-center px-4 shrink-0 border-b border-white/8">
        <div className="flex items-center gap-3">
          <img
            src={okiruLogo}
            alt="Okiru"
            className="h-8 w-8 rounded-full object-contain ring-1 ring-white/15"
            data-testid="img-logo-sidebar"
          />
          <div className="flex flex-col gap-0">
            <span className="text-[14px] font-extrabold tracking-widest leading-tight text-white">OKIRU</span>
            <span className="text-[9px] font-semibold text-white/30 tracking-[0.2em] leading-tight">.PRO</span>
          </div>
        </div>
      </div>

      {/* ── Nav ── */}
      <div className="flex-1 overflow-y-auto px-2 pt-1 pb-2 space-y-1 scrollbar-thin">
        <CollapsibleSection label="Platform">
          {mainNavItems.map((navItem) => (
            <NavItem key={navItem.name} item={navItem} isActive={location === navItem.href} />
          ))}
        </CollapsibleSection>

        <CollapsibleSection label="Base Data">
          {dataInputItems.map((navItem) => (
            <NavItem key={navItem.name} item={navItem} isActive={location === navItem.href} />
          ))}
        </CollapsibleSection>

        <CollapsibleSection label="Pillars">
          {pillarItems.map((pillarItem) => (
            <PillarNavItem key={pillarItem.name} item={pillarItem} isActive={location === pillarItem.href} />
          ))}
        </CollapsibleSection>
      </div>

      {/* ── Footer ── */}
      <div className="px-2 pb-3 mt-auto border-t border-white/8 space-y-1 pt-3">
        {isLoaded && scorecard && (
          <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-white/7 border border-white/8 mb-1">
            <ScoreRing score={totalScore} total={127} />
            <div className="flex flex-col min-w-0 gap-0.5">
              {/* Label: clear, not washed out */}
              <span className="text-[10.5px] font-semibold text-white/45 uppercase tracking-wider leading-none">
                Total Score
              </span>
              {/* Big readable number */}
              <span className="text-[22px] font-black tabular-nums text-white leading-tight">
                {totalScore.toFixed(1)}
              </span>
              {/* Level badge */}
              <span className="text-[11px] font-bold text-primary leading-none">
                {levelLabel} · {scorecard.recognitionLevel}
              </span>
            </div>
          </div>
        )}
        <NavItem
          item={{ name: "Settings", href: "/settings", icon: Settings }}
          isActive={location === "/settings"}
        />
      </div>
    </div>
  );
}
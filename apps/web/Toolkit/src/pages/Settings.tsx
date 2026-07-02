import { useState } from "react";
import { getProvinces, getEapReportYears } from "@toolkit/lib/calculators/eapTargets";
import { Card, CardContent, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
import { Label } from "@toolkit/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@toolkit/components/ui/select";
import {
  Settings as SettingsIcon,
  Save,
  ChevronRight,
  Calculator,
  Search,
  X,
  Loader2,
  Sun,
  Moon,
  Monitor,
  User,
  Shield,
  ArrowUpCircle,
  DollarSign,
  Users,
  GraduationCap,
  ShoppingCart,
  Handshake,
  Heart,
  BarChart3,
  Award,
  TrendingUp,
} from "lucide-react";
import { useBbeeStore } from "@toolkit/lib/store";
import { useAuth } from "@toolkit/lib/auth";
import { useToast } from "@toolkit/hooks/use-toast";
import { motion } from "framer-motion";
import { cn } from "@toolkit/lib/utils";
import { useTheme } from "@toolkit/components/theme-provider";

interface CalcFormula {
  id: string;
  source: string;
  cell: string;
  formula: string;
  description: string;
}

const PILLAR_ICONS: Record<string, any> = {
  financials: DollarSign,
  tmps: ShoppingCart,
  ownership: TrendingUp,
  management: Users,
  skills: GraduationCap,
  procurement: ShoppingCart,
  esd: Handshake,
  sed: Heart,
  scorecard: BarChart3,
  yes: Award,
};

const PILLAR_COLORS: Record<string, { bg: string; text: string; ring: string; badge: string }> = {
  financials: { bg: "bg-blue-500/10", text: "text-blue-400", ring: "ring-blue-500/20", badge: "bg-blue-500/15 text-blue-300" },
  tmps: { bg: "bg-cyan-500/10", text: "text-cyan-400", ring: "ring-cyan-500/20", badge: "bg-cyan-500/15 text-cyan-300" },
  ownership: { bg: "bg-emerald-500/10", text: "text-emerald-400", ring: "ring-emerald-500/20", badge: "bg-emerald-500/15 text-emerald-300" },
  management: { bg: "bg-violet-500/10", text: "text-violet-400", ring: "ring-violet-500/20", badge: "bg-violet-500/15 text-violet-300" },
  skills: { bg: "bg-amber-500/10", text: "text-amber-400", ring: "ring-amber-500/20", badge: "bg-amber-500/15 text-amber-300" },
  procurement: { bg: "bg-rose-500/10", text: "text-rose-400", ring: "ring-rose-500/20", badge: "bg-rose-500/15 text-rose-300" },
  esd: { bg: "bg-teal-500/10", text: "text-teal-400", ring: "ring-teal-500/20", badge: "bg-teal-500/15 text-teal-300" },
  sed: { bg: "bg-pink-500/10", text: "text-pink-400", ring: "ring-pink-500/20", badge: "bg-pink-500/15 text-pink-300" },
  scorecard: { bg: "bg-orange-500/10", text: "text-orange-400", ring: "ring-orange-500/20", badge: "bg-orange-500/15 text-orange-300" },
  yes: { bg: "bg-lime-500/10", text: "text-lime-400", ring: "ring-lime-500/20", badge: "bg-lime-500/15 text-lime-300" },
};

const CALC_FORMULAS: { key: string; title: string; shortLabel: string; formulas: CalcFormula[] }[] = [
  {
    key: "financials", title: "Financials", shortLabel: "FIN",
    formulas: [
      { id: "f1", source: "Financials", cell: "row74", formula: "Revenue − Exclusions = TMPS", description: "Total Measured Procurement Spend (TMPS) = Inclusions − Exclusions" },
      { id: "f2", source: "Financials", cell: "B10", formula: "AVG(NPAT₁ … NPAT₅)", description: "Last 5 year NPAT average" },
      { id: "f3", source: "Financials", cell: "B11", formula: "MAX(Current NPAT, 5yr Average)", description: "Max NPAT for deemed calculation" },
      { id: "f4", source: "Financials", cell: "Deemed NPAT", formula: "IF(margin ≥ 0.25 × industry norm → Actual NPAT, ELSE → Revenue × Industry Norm)", description: "Deemed NPAT for ESD/SED targets — uses actual profit if healthy, otherwise calculates from revenue" },
    ],
  },
  {
    key: "tmps", title: "TMPS (Procurement Spend)", shortLabel: "TMPS",
    formulas: [
      { id: "t1", source: "TMPS", cell: "B8", formula: "SUM(Inclusion rows)", description: "Total Inclusions for TMPS" },
      { id: "t2", source: "TMPS", cell: "B28", formula: "SUM(Exclusion rows)", description: "Total Exclusions from TMPS" },
    ],
  },
  {
    key: "ownership", title: "Ownership Calculations", shortLabel: "OWN",
    formulas: [
      { id: "o1", source: "Ownership Calcs", cell: "A14", formula: "(Equity Value − Outstanding Debt) ÷ Carrying Value", description: "Deemed Value calculation for net value" },
      { id: "o2", source: "Ownership Calcs", cell: "A21", formula: "B × (1 ÷ (25% × C)) × 8", description: "Formula A — economic interest with graduation factor" },
      { id: "o3", source: "Ownership Calcs", cell: "A27", formula: "B ÷ C × 8", description: "Formula B — straight economic interest (no graduation)" },
      { id: "o4", source: "Outstanding Debts", cell: "H2", formula: "(Value of Equity − Outstanding Debt) ÷ Carrying Value of Debt", description: "Deemed value after debt adjustment" },
    ],
  },
  {
    key: "management", title: "Management Control", shortLabel: "MC",
    formulas: [
      { id: "m1", source: "MC Scorecard", cell: "Grand Total", formula: "Σ (% Black by level × Points per level) + Disabilities 2pts", description: "Sum percentage black at each designation level × points allocation + disability bonus" },
      { id: "m2", source: "MC Scorecard", cell: "Board", formula: "IF(% Black ≥ Target → Full Points, ELSE → 0)", description: "Board scoring is all-or-nothing (meet 50% target = 2 pts)" },
      { id: "m3", source: "MC Scorecard", cell: "Executive", formula: "(Actual % ÷ Target %) × Max Points", description: "Executive scoring is proportional (60% target × 2 pts)" },
    ],
  },
  {
    key: "skills", title: "Skills Development", shortLabel: "SD",
    formulas: [
      { id: "s1", source: "Skills Calcs", cell: "D3", formula: "Leviable Amount × 0.035", description: "3.5% target for black skills training spend" },
      { id: "s2", source: "Skills Scorecard", cell: "Total", formula: "MIN(8, spend ÷ (leviable × 6%) × 8) + MIN(4, bursaries ÷ (leviable × 2.5%) × 4) + MIN(2, disabilities ÷ (leviable × 0.3%) × 2) + absorption bonus (5 pts)", description: "Skills Development total points — black spend + bursaries + disability training + absorption" },
    ],
  },
  {
    key: "procurement", title: "Preferential Procurement", shortLabel: "PP",
    formulas: [
      { id: "p1", source: "Procurement Scorecard", cell: "Total", formula: "Σ (Recognised Spend % of TMPS × Points per category) + Bonuses", description: "Sum of recognised supplier spend categories (e.g. 51% BO spend ÷ 25% target × 11 pts) + bonuses" },
    ],
  },
  {
    key: "esd", title: "Enterprise & Supplier Development", shortLabel: "ESD",
    formulas: [
      { id: "e1", source: "ESD Calcs", cell: "D2", formula: "Contribution Amount × Benefit Factor", description: "Recognised contribution (e.g. Grant × 1.0 = 100%, Interest-free loan × 0.7 = 70%)" },
      { id: "e2", source: "ESD Scorecard", cell: "Total", formula: "MIN(10, Supplier Dev ÷ (NPAT × 2%) × 10) + MIN(5, Enterprise Dev ÷ (NPAT × 1%) × 5) + bonuses", description: "ESD total points — supplier development + enterprise development + bonuses" },
    ],
  },
  {
    key: "sed", title: "Socio-Economic Development", shortLabel: "SED",
    formulas: [
      { id: "d1", source: "SED Scorecard", cell: "Total", formula: "MIN(5, SED Spend ÷ (NPAT × 1%) × 5)", description: "SED total points — CSI contributions as percentage of net profit" },
    ],
  },
  {
    key: "scorecard", title: "Final Scorecard & Level", shortLabel: "SC",
    formulas: [
      { id: "sc1", source: "Scorecard Calcs", cell: "D57", formula: "ROUNDDOWN(Total Pillar Points) → Apply Sub-minimum Discounts", description: "Round down total points, then check if sub-minimums met — if not, drop level" },
      { id: "sc2", source: "Summary", cell: "Level", formula: "Lookup total in sector level table", description: "Overall B-BBEE level and procurement recognition percentage from sector config" },
    ],
  },
  {
    key: "yes", title: "YES Programme Enhancement", shortLabel: "YES",
    formulas: [
      { id: "y1", source: "YES", cell: "Tier", formula: "IF sub-mins met AND headcount target: Tier 1 (1.5× target + absorption = +3 levels), Tier 2 (1× + absorption = +2), Tier 3 (1× = +1)", description: "YES enhancement tiers — additional level boosts for youth employment" },
    ],
  },
];

function CalculationFormulasPanel() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activePillar, setActivePillar] = useState<string | null>(null);

  const query = searchQuery.toLowerCase().trim();
  const filteredSections = CALC_FORMULAS
    .filter(section => !activePillar || section.key === activePillar)
    .map(section => ({
      ...section,
      formulas: section.formulas.filter(f => {
        if (!query) return true;
        return f.formula.toLowerCase().includes(query)
          || f.description.toLowerCase().includes(query)
          || f.source.toLowerCase().includes(query)
          || f.cell.toLowerCase().includes(query)
          || section.title.toLowerCase().includes(query);
      }),
    }))
    .filter(section => section.formulas.length > 0);

  const totalVisible = filteredSections.reduce((sum, s) => sum + s.formulas.length, 0);

  return (
    <div className="space-y-4" data-testid="calculation-formulas-section">
      <div className="relative" data-testid="formula-search-wrapper">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          placeholder="Search formulas... (e.g. NPAT, ownership, leviable)"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9 pr-9 h-10 rounded-xl text-sm"
          data-testid="input-formula-search"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            data-testid="button-clear-search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5" data-testid="pillar-filter-chips">
        <button
          onClick={() => setActivePillar(null)}
          className={cn(
            "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all",
            !activePillar
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-muted/50 text-muted-foreground hover:bg-muted"
          )}
          data-testid="chip-all-pillars"
        >
          All ({CALC_FORMULAS.reduce((s, sec) => s + sec.formulas.length, 0)})
        </button>
        {CALC_FORMULAS.map(section => {
          const Icon = PILLAR_ICONS[section.key];
          const colors = PILLAR_COLORS[section.key];
          const isActive = activePillar === section.key;
          return (
            <button
              key={section.key}
              onClick={() => setActivePillar(isActive ? null : section.key)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1.5",
                isActive
                  ? `${colors.badge} ring-1 ${colors.ring} shadow-sm`
                  : "bg-muted/40 text-muted-foreground hover:bg-muted/70"
              )}
              data-testid={`chip-pillar-${section.key}`}
            >
              <Icon className="h-3 w-3" />
              {section.shortLabel}
              <span className="text-[10px] opacity-60">{section.formulas.length}</span>
            </button>
          );
        })}
      </div>

      {query && (
        <div className="text-[12px] text-muted-foreground">
          {totalVisible === 0 ? (
            <span>No formulas match "{searchQuery}"</span>
          ) : (
            <span>{totalVisible} formula{totalVisible !== 1 ? 's' : ''} found</span>
          )}
        </div>
      )}

      <div className="space-y-4">
        {filteredSections.map(section => {
          const Icon = PILLAR_ICONS[section.key];
          const colors = PILLAR_COLORS[section.key];
          return (
            <div key={section.key} data-testid={`formula-section-${section.key}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={cn("w-6 h-6 rounded-md flex items-center justify-center", colors.bg)}>
                  <Icon className={cn("h-3.5 w-3.5", colors.text)} />
                </div>
                <h4 className="text-[13px] font-semibold">{section.title}</h4>
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded-md font-medium", colors.badge)}>{section.formulas.length}</span>
              </div>
              <div className="space-y-2 pl-8">
                {section.formulas.map(formula => (
                  <div key={formula.id} className="rounded-xl border border-border/30 overflow-hidden" data-testid={`formula-card-${formula.id}`}>
                    <div className="px-3.5 py-2.5">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-mono font-medium", colors.badge)}>{formula.source}</span>
                        <span className="text-[10px] text-muted-foreground/50">:</span>
                        <span className="text-[10px] font-mono text-muted-foreground">{formula.cell}</span>
                      </div>
                      <div className="text-[13px] font-mono text-foreground/90 leading-relaxed mb-1" data-testid={`text-formula-${formula.id}`}>{formula.formula}</div>
                      <div className="text-[11px] text-muted-foreground leading-relaxed" data-testid={`text-description-${formula.id}`}>{formula.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {totalVisible === 0 && !query && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <Calculator className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p>No formulas in this category</p>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const { client, updateSettings, updateIndustry, updateEapYear } = useBbeeStore();
  const { user } = useAuth();
  const { toast } = useToast();

  const [province, setProvince] = useState(client.eapProvince);
  const [industry, setIndustry] = useState(client.industry);
  const [eapYear, setEapYear] = useState<number | undefined>(client.eapYear);
  const [measureStart, setMeasureStart] = useState(client.measurementPeriodStart || '');
  const [measureEnd, setMeasureEnd] = useState(client.measurementPeriodEnd || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // CRITICAL: `industry` is the industry VERTICAL (Manufacturing, Retail,
      // etc.) used for the industry-norm lookup — it is NOT the scorecard
      // sector code. Previously this handler passed `industry` as the
      // industrySector argument to updateSettings, silently overwriting the
      // sector code that drives the entire scorecard configuration. Now uses
      // updateIndustry (which targets client.industry) and PRESERVES the
      // sector code via the existing client.industrySector.
      updateSettings(province, client.industrySector || '', measureStart || undefined, measureEnd || undefined);
      if (industry !== client.industry) updateIndustry(industry);
      if (eapYear !== client.eapYear) updateEapYear(eapYear);
      toast({ title: "Settings Saved", description: "Client preferences updated." });
    } catch {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const { theme, setTheme } = useTheme();

  const ROLE_LABELS: Record<string, string> = {
    auditor: 'B-BBEE Auditor',
    analyst: 'Compliance Analyst',
    manager: 'Team Manager',
    admin: 'Administrator',
  };

  const ROLE_HIERARCHY = ['auditor', 'analyst', 'manager'];

  const currentRole = user?.role || 'auditor';
  const currentRoleIndex = ROLE_HIERARCHY.indexOf(currentRole);
  const canUpgrade = currentRoleIndex >= 0 && currentRoleIndex < ROLE_HIERARCHY.length - 1;
  const nextRole = canUpgrade ? ROLE_HIERARCHY[currentRoleIndex + 1] : null;

  const [isRequestingUpgrade, setIsRequestingUpgrade] = useState(false);

  const handleRequestUpgrade = async () => {
    if (!nextRole) return;
    setIsRequestingUpgrade(true);
    try {
      const res = await fetch('/api/auth/request-role-upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ requestedRole: nextRole }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Upgrade Requested", description: data.message || `Your request to upgrade to ${ROLE_LABELS[nextRole]} has been submitted.` });
      } else {
        toast({ title: "Request Failed", description: data.message || "Could not submit upgrade request.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to submit upgrade request.", variant: "destructive" });
    } finally {
      setIsRequestingUpgrade(false);
    }
  };

  const sectorLabel = [client.sectorCode, client.scorecardType || client.companySize].filter(Boolean).join(' · ');

  return (
    <motion.div
      className="space-y-6 max-w-3xl"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div>
        <h1 className="text-2xl font-heading font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Account, appearance, and client preferences. Scoring rules come from sector config only.</p>
      </div>

      <Card className="glass-panel">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            Account & Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Full Name</Label>
              <div className="text-sm font-medium mt-1">{user?.fullName || user?.username || '—'}</div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Email</Label>
              <div className="text-sm font-medium mt-1">{user?.email || '—'}</div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Organization</Label>
              <div className="text-sm font-medium mt-1">{user?.organizationName || '—'}</div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Username</Label>
              <div className="text-sm font-medium mt-1">{user?.username || '—'}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Sun className="h-4 w-4 text-muted-foreground" />
            Appearance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            {[
              { value: 'light' as const, label: 'Light', icon: Sun },
              { value: 'dark' as const, label: 'Dark', icon: Moon },
              { value: 'system' as const, label: 'System', icon: Monitor },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
                  theme === opt.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <opt.icon className="h-4 w-4" />
                {opt.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            Role & Permissions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{ROLE_LABELS[currentRole] || currentRole}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {currentRole === 'auditor' && 'Conduct and manage compliance audits'}
                {currentRole === 'analyst' && 'Analyze scorecard data and generate reports'}
                {currentRole === 'manager' && 'Oversee audit teams and review results'}
                {currentRole === 'admin' && 'Full system access and user management'}
              </div>
            </div>
            <span className={cn(
              "px-2.5 py-1 rounded-lg text-[11px] font-semibold uppercase tracking-wider",
              currentRole === 'admin' ? "bg-violet-500/15 text-violet-400" :
              currentRole === 'manager' ? "bg-amber-500/15 text-amber-400" :
              currentRole === 'analyst' ? "bg-blue-500/15 text-blue-400" :
              "bg-emerald-500/15 text-emerald-400"
            )}>
              {currentRole}
            </span>
          </div>

          {canUpgrade && nextRole && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/50">
              <div className="flex items-center gap-3">
                <ArrowUpCircle className="h-5 w-5 text-primary" />
                <div>
                  <div className="text-sm font-medium">Upgrade to {ROLE_LABELS[nextRole]}</div>
                  <div className="text-xs text-muted-foreground">Request elevated permissions from your admin</div>
                </div>
              </div>
              <Button
                size="sm"
                className="rounded-full gap-1.5 h-8"
                onClick={handleRequestUpgrade}
                disabled={isRequestingUpgrade}
              >
                {isRequestingUpgrade ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpCircle className="h-3.5 w-3.5" />}
                Request Upgrade
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Role Progression</div>
            <div className="flex items-center gap-1">
              {ROLE_HIERARCHY.map((role, i) => (
                <div key={role} className="flex items-center gap-1">
                  <div className={cn(
                    "px-3 py-1.5 rounded-lg text-[12px] font-medium",
                    i <= currentRoleIndex
                      ? "bg-primary/15 text-primary border border-primary/25"
                      : "bg-muted/40 text-muted-foreground border border-border/30"
                  )}>
                    {ROLE_LABELS[role]}
                  </div>
                  {i < ROLE_HIERARCHY.length - 1 && (
                    <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <SettingsIcon className="h-4 w-4 text-muted-foreground" />
            Client Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {sectorLabel && (
            <div className="rounded-lg bg-muted/30 border border-border/40 px-3 py-2 text-[12px] text-muted-foreground">
              Scoring rules and level thresholds are loaded from sector config: <span className="font-medium text-foreground">{sectorLabel}</span>
            </div>
          )}

          <div className="grid gap-2">
            <Label className="text-[13px]">EAP Province</Label>
            <Select value={province} onValueChange={setProvince}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select Province" />
              </SelectTrigger>
              <SelectContent>
                {getProvinces().map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Demographic targets for Management Control.</p>
          </div>

          <div className="grid gap-2">
            <Label className="text-[13px]">EAP Report Year (CEE)</Label>
            <Select
              value={eapYear === undefined ? 'latest' : String(eapYear)}
              onValueChange={(v) => setEapYear(v === 'latest' ? undefined : Number(v))}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Latest CEE report" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="latest">Latest ({getEapReportYears()[0]} — current CEE report)</SelectItem>
                {getEapReportYears().map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              CEE EAP dataset vintage the MC &amp; Skills demographic targets score against. Use the year your measurement period was verified under.
            </p>
          </div>

          <div className="grid gap-2">
            <Label className="text-[13px]">Industry Sector</Label>
            <Select value={industry} onValueChange={setIndustry}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select Sector" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Generic">Generic / General</SelectItem>
                <SelectItem value="ICT">ICT Sector</SelectItem>
                <SelectItem value="Construction">Construction</SelectItem>
                <SelectItem value="Financial">Financial</SelectItem>
                <SelectItem value="Transport">Transport & Logistics</SelectItem>
                <SelectItem value="Mining">Mining & Quarrying</SelectItem>
                <SelectItem value="Manufacturing">Manufacturing</SelectItem>
                <SelectItem value="Retail">Retail</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Used for deemed NPAT and industry norm comparisons only — does not override scorecard sector rules.</p>
          </div>

          <div className="grid gap-2">
            <Label className="text-[13px]">Measurement Period</Label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-muted-foreground">Start</Label>
                <Input
                  type="month"
                  className="h-9 font-mono text-sm"
                  value={measureStart}
                  onChange={e => setMeasureStart(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">End</Label>
                <Input
                  type="month"
                  className="h-9 font-mono text-sm"
                  value={measureEnd}
                  onChange={e => setMeasureEnd(e.target.value)}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">12-month B-BBEE measurement period for this verification.</p>
          </div>

          <Button className="w-full gap-2 mt-2 rounded-full h-10" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? "Saving..." : "Save Preferences"}
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 pt-2">
        <h2 className="text-lg font-heading font-semibold">Calculation Formulas</h2>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
          <Calculator className="h-3 w-3" />
          Read-only reference
        </div>
      </div>

      <CalculationFormulasPanel />
    </motion.div>
  );
}

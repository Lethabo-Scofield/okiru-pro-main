import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
import { Label } from "@toolkit/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@toolkit/components/ui/select";
import { Settings as SettingsIcon, Save, ChevronDown, ChevronRight, Info, RotateCcw, Pencil, Lock, Plus, Trash2, Sparkles, Loader2, Calculator, FileSpreadsheet, Search, X, DollarSign, Users, GraduationCap, ShoppingCart, Handshake, Heart, BarChart3, Award, TrendingUp } from "lucide-react";
import { useBbeeStore } from "@toolkit/lib/store";
import { useAuth } from "@toolkit/lib/auth";
import { useToast } from "@toolkit/hooks/use-toast";
import { api } from "@toolkit/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@toolkit/lib/utils";
import type { CalculatorConfig } from "../../../shared/schema";

function getDefaults(): CalculatorConfig {
  return {
    ownership: {
      votingRightsMax: 4,
      womenBonusMax: 2,
      economicInterestMax: 8,
      netValueMax: 8,
      targetEconomicInterest: 0.25,
      subMinNetValue: 3.2,
    },
    management: {
      boardBlackTarget: 0.5,
      boardBlackPoints: 6,
      boardWomenTarget: 0.25,
      boardWomenPoints: 1,
      execBlackTarget: 0.6,
      execBlackPoints: 4,
      execWomenTarget: 0.3,
      execWomenPoints: 2,
    },
    skills: {
      generalMax: 20,
      bursaryMax: 5,
      overallTarget: 0.035,
      bursaryTarget: 0.025,
      subMinThreshold: 10,
    },
    procurement: {
      baseMax: 25,
      bonusMax: 2,
      tmpsTarget: 0.8,
      subMinThreshold: 11.6,
      blackOwnedThreshold: 0.51,
    },
    esd: {
      supplierDevMax: 10,
      enterpriseDevMax: 5,
      supplierDevTarget: 0.02,
      enterpriseDevTarget: 0.01,
    },
    sed: {
      maxPoints: 5,
      npatTarget: 0.01,
    },
    discounting: {
      dropLevels: 1,
      maxDropLevel: 8,
    },
    benefitFactors: [
      { type: "grant", factor: 1.0 },
      { type: "interest_free_loan", factor: 0.7 },
      { type: "professional_services", factor: 0.8 },
    ],
    industryNorms: [
      { name: "Transport / Logistics", norm: "2.69%" },
      { name: "Mining & Quarrying", norm: "5.76%" },
      { name: "Construction", norm: "3.47%" },
      { name: "Manufacturing", norm: "4.12%" },
      { name: "Retail", norm: "2.15%" },
      { name: "Wholesale / Distribution", norm: "2.85%" },
      { name: "Financial / Banking", norm: "6.02%" },
      { name: "ICT / Technology", norm: "5.12%" },
      { name: "Agriculture", norm: "3.12%" },
      { name: "Hospitality / Tourism", norm: "2.95%" },
    ],
  };
}

function toDisplay(val: number, isPercent: boolean): string {
  if (isPercent) return String(Math.round(val * 10000) / 100);
  return String(val);
}

function fromDisplay(val: string, isPercent: boolean): number {
  const num = parseFloat(val);
  if (isNaN(num)) return 0;
  if (isPercent) return num / 100;
  return num;
}

const LEVEL_TABLE = [
  { min: 100, level: 1, recognition: 135 },
  { min: 95, level: 2, recognition: 125 },
  { min: 90, level: 3, recognition: 110 },
  { min: 80, level: 4, recognition: 100 },
  { min: 75, level: 5, recognition: 80 },
  { min: 70, level: 6, recognition: 60 },
  { min: 55, level: 7, recognition: 50 },
  { min: 40, level: 8, recognition: 10 },
  { min: 0, level: 9, recognition: 0 },
];

const RECOGNITION_TABLE = [
  { level: 1, factor: 135 },
  { level: 2, factor: 125 },
  { level: 3, factor: 110 },
  { level: 4, factor: 100 },
  { level: 5, factor: 80 },
  { level: 6, factor: 60 },
  { level: 7, factor: 50 },
  { level: 8, factor: 10 },
  { level: 0, factor: 0 },
];

const GRADUATION_TABLE = [
  { year: 1, factor: 10 },
  { year: 2, factor: 20 },
  { year: 3, factor: 40 },
  { year: 4, factor: 60 },
  { year: 5, factor: 80 },
  { year: "6+", factor: 100 },
];

function SectionToggle({ title, description, open, onToggle, children }: {
  title: string; description: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="border border-border/50 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30"
        style={{ transition: "background-color 0.15s ease" }}
        onClick={onToggle}
      >
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-2 border-t border-border/30 space-y-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ParamRow({ label, hint, value, suffix, onChange, disabled }: {
  label: string; hint?: string; value: number | string; suffix?: string;
  onChange?: (v: string) => void; disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium">{label}</div>
        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Input
          type="text"
          value={value}
          onChange={e => onChange?.(e.target.value)}
          disabled={disabled}
          className={cn("w-20 h-8 text-right text-sm tabular-nums", !disabled && "border-primary/30")}
        />
        {suffix && <span className="text-xs text-muted-foreground w-6">{suffix}</span>}
      </div>
    </div>
  );
}

function MiniTable({ headers, rows }: {
  headers: string[];
  rows: (string | number)[][];
}) {
  const gridStyle = { gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))` };
  return (
    <div className="rounded-lg border border-border/40 overflow-hidden text-[13px]">
      <div className="grid bg-muted/40 border-b border-border/30 px-3 py-1.5" style={gridStyle}>
        {headers.map((h, i) => (
          <div key={i} className={cn("text-xs font-medium text-muted-foreground", i > 0 && "text-right")}>{h}</div>
        ))}
      </div>
      {rows.map((row, ri) => (
        <div key={ri} className="grid px-3 py-1.5 border-b border-border/20 last:border-0" style={gridStyle}>
          {row.map((cell, ci) => (
            <div key={ci} className={cn("tabular-nums", ci > 0 && "text-right")}>{cell}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

function EditableTable({ headers, rows, onEdit, onDelete, canEdit }: {
  headers: string[];
  rows: { cells: (string | number)[]; id: number }[];
  onEdit?: (id: number, colIndex: number, value: string) => void;
  onDelete?: (id: number) => void;
  canEdit: boolean;
}) {
  const colCount = canEdit ? headers.length + 1 : headers.length;
  const gridStyle = { gridTemplateColumns: canEdit ? `repeat(${headers.length}, minmax(0, 1fr)) 40px` : `repeat(${headers.length}, minmax(0, 1fr))` };
  return (
    <div className="rounded-lg border border-border/40 overflow-hidden text-[13px]">
      <div className="grid bg-muted/40 border-b border-border/30 px-3 py-1.5" style={gridStyle}>
        {headers.map((h, i) => (
          <div key={i} className={cn("text-xs font-medium text-muted-foreground", i > 0 && "text-right")}>{h}</div>
        ))}
        {canEdit && <div />}
      </div>
      {rows.map((row) => (
        <div key={row.id} className="grid px-3 py-1 border-b border-border/20 last:border-0 items-center" style={gridStyle}>
          {row.cells.map((cell, ci) => (
            <div key={ci} className={cn("tabular-nums", ci > 0 && "text-right")}>
              {canEdit ? (
                <Input
                  type="text"
                  value={cell}
                  onChange={e => onEdit?.(row.id, ci, e.target.value)}
                  className="h-7 text-[13px] border-primary/20 px-1.5"
                />
              ) : (
                <span>{cell}</span>
              )}
            </div>
          ))}
          {canEdit && (
            <button onClick={() => onDelete?.(row.id)} className="text-destructive/60 hover:text-destructive ml-1">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

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
      { id: "sc2", source: "Summary", cell: "Level", formula: "Lookup total in level table (≥100 = L1 @135%, ≥95 = L2 @125%, … <40 = Non-Compliant)", description: "Overall B-BBEE level and procurement recognition percentage" },
    ],
  },
  {
    key: "yes", title: "YES Programme Enhancement", shortLabel: "YES",
    formulas: [
      { id: "y1", source: "YES", cell: "Tier", formula: "IF sub-mins met AND headcount target: Tier 1 (1.5× target + absorption = +3 levels), Tier 2 (1× + absorption = +2), Tier 3 (1× = +1)", description: "YES enhancement tiers — additional level boosts for youth employment" },
    ],
  },
];

function CalculationFormulasPanel({ canEdit }: { canEdit: boolean }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activePillar, setActivePillar] = useState<string | null>(null);
  const [customFormulas, setCustomFormulas] = useState<Record<string, CalcFormula>>({});

  const handleEditFormula = (id: string, field: 'formula' | 'description', value: string) => {
    const allFormulas = CALC_FORMULAS.flatMap(s => s.formulas);
    const original = allFormulas.find(f => f.id === id);
    if (!original) return;
    const current = customFormulas[id] || { ...original };
    setCustomFormulas(prev => ({ ...prev, [id]: { ...current, [field]: value } }));
  };

  const getFormula = (formula: CalcFormula): CalcFormula => customFormulas[formula.id] || formula;

  const query = searchQuery.toLowerCase().trim();
  const filteredSections = CALC_FORMULAS
    .filter(section => !activePillar || section.key === activePillar)
    .map(section => ({
      ...section,
      formulas: section.formulas.filter(f => {
        if (!query) return true;
        const resolved = getFormula(f);
        return resolved.formula.toLowerCase().includes(query)
          || resolved.description.toLowerCase().includes(query)
          || resolved.source.toLowerCase().includes(query)
          || resolved.cell.toLowerCase().includes(query)
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
                {section.formulas.map(formula => {
                  const resolved = getFormula(formula);
                  return (
                    <div key={formula.id} className={cn("rounded-xl border border-border/30 overflow-hidden transition-all hover:border-border/50", canEdit && `hover:ring-1 ${colors.ring}`)} data-testid={`formula-card-${formula.id}`}>
                      <div className="px-3.5 py-2.5">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-mono font-medium", colors.badge)}>{resolved.source}</span>
                          <span className="text-[10px] text-muted-foreground/50">:</span>
                          <span className="text-[10px] font-mono text-muted-foreground">{resolved.cell}</span>
                        </div>
                        {canEdit ? (
                          <Input
                            type="text"
                            value={resolved.formula}
                            onChange={e => handleEditFormula(formula.id, 'formula', e.target.value)}
                            className="h-8 text-[13px] font-mono border-primary/20 bg-muted/20 mb-1"
                            data-testid={`input-formula-${formula.id}`}
                          />
                        ) : (
                          <div className="text-[13px] font-mono text-foreground/90 leading-relaxed mb-1" data-testid={`text-formula-${formula.id}`}>{resolved.formula}</div>
                        )}
                        {canEdit ? (
                          <Input
                            type="text"
                            value={resolved.description}
                            onChange={e => handleEditFormula(formula.id, 'description', e.target.value)}
                            className="h-7 text-[11px] text-muted-foreground border-primary/10"
                            data-testid={`input-description-${formula.id}`}
                          />
                        ) : (
                          <div className="text-[11px] text-muted-foreground leading-relaxed" data-testid={`text-description-${formula.id}`}>{resolved.description}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
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
  const { client, updateSettings, calculatorConfig, saveCalculatorConfig, activeClientId } = useBbeeStore();
  const { user } = useAuth();
  const { toast } = useToast();

  const [editMode, setEditMode] = useState(false);
  const canEdit = editMode;

  const [province, setProvince] = useState(client.eapProvince);
  const [industry, setIndustry] = useState(client.industrySector);
  const [measureStart, setMeasureStart] = useState(client.measurementPeriodStart || '');
  const [measureEnd, setMeasureEnd] = useState(client.measurementPeriodEnd || '');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    levels: true,
    ownership: true,
    management: true,
    skills: true,
    procurement: true,
    esd: true,
    sed: true,
    discounting: true,
    deemed: true,
  });
  const [params, setParams] = useState<CalculatorConfig>(() => calculatorConfig || getDefaults());
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'rules' | 'calculations'>('rules');

  useEffect(() => {
    if (calculatorConfig) {
      setParams(calculatorConfig);
    }
  }, [calculatorConfig]);

  const toggle = (key: string) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  const updateParam = <S extends keyof CalculatorConfig>(
    section: S,
    key: string,
    value: string,
    isPercent = false
  ) => {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    const actualValue = isPercent ? num / 100 : num;
    setParams(prev => ({
      ...prev,
      [section]: { ...(prev[section] as any), [key]: actualValue },
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      updateSettings(province, industry, measureStart || undefined, measureEnd || undefined);
      await saveCalculatorConfig(params);
      toast({ title: "Settings Saved", description: "Configuration and scoring parameters updated and applied." });
    } catch (error) {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setParams(getDefaults());
    toast({ title: "Reset to Defaults", description: "All parameters restored to Generic Codes defaults. Click Save to apply." });
  };

  const handleAddBenefitFactor = () => {
    setParams(prev => ({
      ...prev,
      benefitFactors: [...prev.benefitFactors, { type: "new_type", factor: 0.8 }],
    }));
  };

  const handleEditBenefitFactor = (id: number, colIndex: number, value: string) => {
    setParams(prev => ({
      ...prev,
      benefitFactors: prev.benefitFactors.map((bf, i) => {
        if (i !== id) return bf;
        if (colIndex === 0) {
          const snakeCase = value.toLowerCase().replace(/[\s/]+/g, '_').replace(/[^a-z0-9_]/g, '');
          return { ...bf, type: snakeCase };
        }
        const parsed = parseFloat(value.replace('%', ''));
        return { ...bf, factor: isNaN(parsed) ? bf.factor : parsed / 100 };
      }),
    }));
  };

  const handleDeleteBenefitFactor = (id: number) => {
    setParams(prev => ({
      ...prev,
      benefitFactors: prev.benefitFactors.filter((_, i) => i !== id),
    }));
  };

  const handleAddIndustryNorm = () => {
    setParams(prev => ({
      ...prev,
      industryNorms: [...prev.industryNorms, { name: "New Industry", norm: "0.00%" }],
    }));
  };

  const handleEditIndustryNorm = (id: number, colIndex: number, value: string) => {
    setParams(prev => ({
      ...prev,
      industryNorms: prev.industryNorms.map((n, i) => {
        if (i !== id) return n;
        if (colIndex === 0) return { ...n, name: value };
        return { ...n, norm: value };
      }),
    }));
  };

  const handleDeleteIndustryNorm = (id: number) => {
    setParams(prev => ({
      ...prev,
      industryNorms: prev.industryNorms.filter((_, i) => i !== id),
    }));
  };

  const handleGenerateAI = async (type: 'benefitFactor' | 'industryNorm') => {
    setIsGenerating(type);
    try {
      const existing = type === 'benefitFactor' ? params.benefitFactors : params.industryNorms;
      const result = await api.generateCalculatorSuggestions({
        type,
        industry: client.industrySector,
        existing,
      });
      const suggestion = result.suggestion;
      if (type === 'benefitFactor' && suggestion.type) {
        setParams(prev => ({
          ...prev,
          benefitFactors: [...prev.benefitFactors, { type: suggestion.type, factor: suggestion.factor ?? 0.8 }],
        }));
        toast({ title: "AI Suggestion Added", description: `Added "${suggestion.type}" with factor ${Math.round((suggestion.factor ?? 0.8) * 100)}%` });
      } else if (type === 'industryNorm' && suggestion.name) {
        setParams(prev => ({
          ...prev,
          industryNorms: [...prev.industryNorms, { name: suggestion.name, norm: suggestion.norm ?? "0.00%" }],
        }));
        toast({ title: "AI Suggestion Added", description: `Added "${suggestion.name}" industry norm` });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to generate AI suggestion.", variant: "destructive" });
    } finally {
      setIsGenerating(null);
    }
  };

  const p = params;

  return (
    <motion.div
      className="space-y-6 max-w-3xl"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Configure calculations, thresholds, and scoring rules.</p>
        </div>
        <Button
          variant={editMode ? "default" : "outline"}
          size="sm"
          className="rounded-full gap-2 h-9"
          onClick={() => setEditMode(!editMode)}
        >
          {editMode ? <Lock className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          {editMode ? "Lock" : "Edit Parameters"}
        </Button>
      </div>

      <Card className="glass-panel">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <SettingsIcon className="h-4 w-4 text-muted-foreground" />
            General Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label className="text-[13px]">EAP Province</Label>
            <Select value={province} onValueChange={setProvince}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select Province" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="National">National</SelectItem>
                <SelectItem value="Gauteng">Gauteng</SelectItem>
                <SelectItem value="Western Cape">Western Cape</SelectItem>
                <SelectItem value="KZN">KwaZulu-Natal</SelectItem>
                <SelectItem value="Eastern Cape">Eastern Cape</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Demographic targets for Management Control.</p>
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
            <p className="text-[11px] text-muted-foreground">Affects deemed NPAT calculation and industry norm comparisons.</p>
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
            {isSaving ? "Saving..." : "Save Configuration"}
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-xl" data-testid="settings-view-tabs">
        <button
          onClick={() => setActiveView('rules')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
            activeView === 'rules'
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
          data-testid="tab-scoring-rules"
        >
          <Award className="h-4 w-4" />
          Scoring Rules
        </button>
        <button
          onClick={() => setActiveView('calculations')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
            activeView === 'calculations'
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
          data-testid="tab-calculations"
        >
          <Calculator className="h-4 w-4" />
          Calculation Formulas
        </button>
      </div>

      <div className={activeView === 'rules' ? '' : 'hidden'}>
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-heading font-semibold">Scoring Rules</h2>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
            <Info className="h-3 w-3" />
            Generic Codes of Good Practice
          </div>
        </div>
        {canEdit && (
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={handleResetDefaults}>
            <RotateCcw className="h-3 w-3" />
            Reset to Defaults
          </Button>
        )}
      </div>

      {canEdit && (
        <div className="flex items-start gap-2 bg-primary/5 dark:bg-primary/10 rounded-xl p-3">
          <Pencil className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
          <p className="text-[12px] text-muted-foreground">Edit mode active. Changes to scoring parameters apply to calculations when saved. Use "Reset to Defaults" to restore standard values.</p>
        </div>
      )}

      <div className="space-y-3">
        <SectionToggle
          title="B-BBEE Level Table"
          description="How total points convert to levels and recognition percentages"
          open={!!openSections['levels']}
          onToggle={() => toggle('levels')}
        >
          <p className="text-[12px] text-muted-foreground">Your total scorecard points determine your B-BBEE level. Each level has a procurement recognition percentage that clients use when calculating their own procurement scores.</p>
          <MiniTable
            headers={["Minimum Points", "B-BBEE Level", "Recognition %"]}
            rows={LEVEL_TABLE.map(r => [
              r.min === 0 ? "Below 40" : `≥ ${r.min}`,
              r.level === 9 ? "Non-Compliant" : `Level ${r.level}`,
              `${r.recognition}%`
            ])}
          />
          <div className="flex items-start gap-2 bg-muted/30 rounded-lg p-3">
            <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-[11px] text-muted-foreground">Level 1 at 135% means your clients can count 135% of what they spend with you towards their own procurement score.</p>
          </div>
        </SectionToggle>

        <SectionToggle
          title={`Ownership (max ${p.ownership.votingRightsMax + p.ownership.womenBonusMax + p.ownership.economicInterestMax + p.ownership.netValueMax} pts)`}
          description="Voting rights, economic interest, net value, and women's bonus"
          open={!!openSections['ownership']}
          onToggle={() => toggle('ownership')}
        >
          <p className="text-[12px] text-muted-foreground">Measures black ownership through voting rights, economic interest, and net value. Ownership beyond target earns proportional points.</p>
          <div className="space-y-1 divide-y divide-border/20">
            <ParamRow label="Voting Rights" hint="Points for black voting rights in the entity" value={p.ownership.votingRightsMax} suffix="pts" disabled={!canEdit} onChange={v => updateParam('ownership', 'votingRightsMax', v)} />
            <ParamRow label="Women's Bonus" hint="Extra points for black women ownership" value={p.ownership.womenBonusMax} suffix="pts" disabled={!canEdit} onChange={v => updateParam('ownership', 'womenBonusMax', v)} />
            <ParamRow label="Economic Interest" hint="Black shareholders' economic stake" value={p.ownership.economicInterestMax} suffix="pts" disabled={!canEdit} onChange={v => updateParam('ownership', 'economicInterestMax', v)} />
            <ParamRow label="Net Value" hint="Value of black-held shares minus debt" value={p.ownership.netValueMax} suffix="pts" disabled={!canEdit} onChange={v => updateParam('ownership', 'netValueMax', v)} />
            <ParamRow label="Target Ownership" hint="Target percentage for full points" value={toDisplay(p.ownership.targetEconomicInterest, true)} suffix="%" disabled={!canEdit} onChange={v => updateParam('ownership', 'targetEconomicInterest', v, true)} />
            <ParamRow label="Sub-minimum" hint="Net value >= this pts OR 100% black voting" value={p.ownership.subMinNetValue} suffix="pts" disabled={!canEdit} onChange={v => updateParam('ownership', 'subMinNetValue', v)} />
          </div>
          <div className="pt-2">
            <p className="text-[12px] font-medium text-muted-foreground mb-2">Graduation Table (Net Value recognition over time)</p>
            <MiniTable
              headers={["Year of Ownership", "Recognition Factor"]}
              rows={GRADUATION_TABLE.map(r => [
                `Year ${r.year}`,
                `${r.factor}%`
              ])}
            />
            <p className="text-[11px] text-muted-foreground mt-2">New black-owned shares are recognised gradually — 10% in year 1, scaling to 100% by year 6.</p>
          </div>
        </SectionToggle>

        <SectionToggle
          title={`Management Control (max ${p.management.boardBlackPoints + p.management.boardWomenPoints + p.management.execBlackPoints + p.management.execWomenPoints} pts)`}
          description="Board and executive management representation targets"
          open={!!openSections['management']}
          onToggle={() => toggle('management')}
        >
          <p className="text-[12px] text-muted-foreground">Board scoring is all-or-nothing (meet target = full points). Executive scoring is proportional (partial credit for progress toward target).</p>
          <div className="space-y-1 divide-y divide-border/20">
            <ParamRow label="Board — Black Target" hint="≥ target = full pts, below = 0 pts" value={toDisplay(p.management.boardBlackTarget, true)} suffix="%" disabled={!canEdit} onChange={v => updateParam('management', 'boardBlackTarget', v, true)} />
            <ParamRow label="Board — Black Points" hint="All-or-nothing" value={p.management.boardBlackPoints} suffix="pts" disabled={!canEdit} onChange={v => updateParam('management', 'boardBlackPoints', v)} />
            <ParamRow label="Board — Women Target" hint="≥ target = full pts, below = 0 pts" value={toDisplay(p.management.boardWomenTarget, true)} suffix="%" disabled={!canEdit} onChange={v => updateParam('management', 'boardWomenTarget', v, true)} />
            <ParamRow label="Board — Women Points" hint="All-or-nothing" value={p.management.boardWomenPoints} suffix="pts" disabled={!canEdit} onChange={v => updateParam('management', 'boardWomenPoints', v)} />
            <ParamRow label="Exec — Black Target" hint="Proportional: actual% / target% x max pts" value={toDisplay(p.management.execBlackTarget, true)} suffix="%" disabled={!canEdit} onChange={v => updateParam('management', 'execBlackTarget', v, true)} />
            <ParamRow label="Exec — Black Points" hint="Proportional scoring up to max" value={p.management.execBlackPoints} suffix="pts" disabled={!canEdit} onChange={v => updateParam('management', 'execBlackPoints', v)} />
            <ParamRow label="Exec — Women Target" hint="Proportional: actual% / target% x max pts" value={toDisplay(p.management.execWomenTarget, true)} suffix="%" disabled={!canEdit} onChange={v => updateParam('management', 'execWomenTarget', v, true)} />
            <ParamRow label="Exec — Women Points" hint="Proportional scoring up to max" value={p.management.execWomenPoints} suffix="pts" disabled={!canEdit} onChange={v => updateParam('management', 'execWomenPoints', v)} />
          </div>
        </SectionToggle>

        <SectionToggle
          title={`Skills Development (max ${p.skills.generalMax + p.skills.bursaryMax} pts)`}
          description="Training spend targets and bursary allocations"
          open={!!openSections['skills']}
          onToggle={() => toggle('skills')}
        >
          <p className="text-[12px] text-muted-foreground">Measures training spend on black employees as a percentage of payroll (leviable amount). Includes general training and bursary programmes.</p>
          <div className="space-y-1 divide-y divide-border/20">
            <ParamRow label="General Training" hint="Maximum points for overall training spend" value={p.skills.generalMax} suffix="pts" disabled={!canEdit} onChange={v => updateParam('skills', 'generalMax', v)} />
            <ParamRow label="Bursary Programmes" hint="Maximum points for bursary spend" value={p.skills.bursaryMax} suffix="pts" disabled={!canEdit} onChange={v => updateParam('skills', 'bursaryMax', v)} />
            <ParamRow label="Overall Spend Target" hint="% of leviable amount to spend on training" value={toDisplay(p.skills.overallTarget, true)} suffix="%" disabled={!canEdit} onChange={v => updateParam('skills', 'overallTarget', v, true)} />
            <ParamRow label="Bursary Spend Target" hint="% of leviable amount for bursaries" value={toDisplay(p.skills.bursaryTarget, true)} suffix="%" disabled={!canEdit} onChange={v => updateParam('skills', 'bursaryTarget', v, true)} />
            <ParamRow label="Sub-minimum" hint="Min general points to avoid discounting" value={p.skills.subMinThreshold} suffix="pts" disabled={!canEdit} onChange={v => updateParam('skills', 'subMinThreshold', v)} />
          </div>
          <div className="flex items-start gap-2 bg-muted/30 rounded-lg p-3">
            <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-[11px] text-muted-foreground">Only spend on black employees counts. The leviable amount is typically your annual payroll.</p>
          </div>
        </SectionToggle>

        <SectionToggle
          title={`Preferential Procurement (max ${p.procurement.baseMax + p.procurement.bonusMax} pts)`}
          description="Supplier recognition levels and spend targets"
          open={!!openSections['procurement']}
          onToggle={() => toggle('procurement')}
        >
          <p className="text-[12px] text-muted-foreground">Measures how much you spend with B-BBEE compliant suppliers. Supplier spend is multiplied by their recognition level before being compared to your target.</p>
          <div className="space-y-1 divide-y divide-border/20">
            <ParamRow label="Base Points" hint="Maximum from recognised supplier spend" value={p.procurement.baseMax} suffix="pts" disabled={!canEdit} onChange={v => updateParam('procurement', 'baseMax', v)} />
            <ParamRow label="Bonus Points" hint="Extra for 51%+ black-owned suppliers" value={p.procurement.bonusMax} suffix="pts" disabled={!canEdit} onChange={v => updateParam('procurement', 'bonusMax', v)} />
            <ParamRow label="TMPS Target" hint="% of total spend that should go to compliant suppliers" value={toDisplay(p.procurement.tmpsTarget, true)} suffix="%" disabled={!canEdit} onChange={v => updateParam('procurement', 'tmpsTarget', v, true)} />
            <ParamRow label="Sub-minimum" hint="Min base points to avoid discounting" value={p.procurement.subMinThreshold} suffix="pts" disabled={!canEdit} onChange={v => updateParam('procurement', 'subMinThreshold', v)} />
            <ParamRow label="Black-Owned Threshold" hint="Minimum black ownership % for bonus points" value={toDisplay(p.procurement.blackOwnedThreshold, true)} suffix="%" disabled={!canEdit} onChange={v => updateParam('procurement', 'blackOwnedThreshold', v, true)} />
          </div>
          <div className="pt-2">
            <p className="text-[12px] font-medium text-muted-foreground mb-2">Supplier Recognition Multipliers</p>
            <MiniTable
              headers={["Supplier Level", "Recognition Factor"]}
              rows={RECOGNITION_TABLE.map(r => [
                r.level === 0 ? "Non-Compliant" : `Level ${r.level}`,
                `${r.factor}%`
              ])}
            />
            <p className="text-[11px] text-muted-foreground mt-2">A Level 1 supplier's spend counts at 135% — so R100k spent = R135k recognised.</p>
          </div>
        </SectionToggle>

        <SectionToggle
          title={`Enterprise & Supplier Development (max ${p.esd.supplierDevMax + p.esd.enterpriseDevMax} pts)`}
          description="ESD contributions as percentage of net profit"
          open={!!openSections['esd']}
          onToggle={() => toggle('esd')}
        >
          <p className="text-[12px] text-muted-foreground">Measures contributions to developing black-owned businesses. Different types of support are recognised at different rates.</p>
          <div className="space-y-1 divide-y divide-border/20">
            <ParamRow label="Supplier Development" hint="Max points for supplier development" value={p.esd.supplierDevMax} suffix="pts" disabled={!canEdit} onChange={v => updateParam('esd', 'supplierDevMax', v)} />
            <ParamRow label="Enterprise Development" hint="Max points for enterprise development" value={p.esd.enterpriseDevMax} suffix="pts" disabled={!canEdit} onChange={v => updateParam('esd', 'enterpriseDevMax', v)} />
            <ParamRow label="Supplier Dev Target" hint="% of net profit (NPAT) for supplier dev" value={toDisplay(p.esd.supplierDevTarget, true)} suffix="%" disabled={!canEdit} onChange={v => updateParam('esd', 'supplierDevTarget', v, true)} />
            <ParamRow label="Enterprise Dev Target" hint="% of net profit (NPAT) for enterprise dev" value={toDisplay(p.esd.enterpriseDevTarget, true)} suffix="%" disabled={!canEdit} onChange={v => updateParam('esd', 'enterpriseDevTarget', v, true)} />
          </div>
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12px] font-medium text-muted-foreground">Benefit Type Recognition</p>
              {canEdit && (
                <div className="flex gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => handleGenerateAI('benefitFactor')}
                    disabled={isGenerating === 'benefitFactor'}
                  >
                    {isGenerating === 'benefitFactor' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    AI Suggest
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleAddBenefitFactor}>
                    <Plus className="h-3 w-3" /> Add
                  </Button>
                </div>
              )}
            </div>
            <EditableTable
              headers={["Contribution Type", "Recognised At"]}
              rows={p.benefitFactors.map((bf, i) => ({
                id: i,
                cells: canEdit ? [bf.type, `${Math.round(bf.factor * 100)}%`] : [bf.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), `${Math.round(bf.factor * 100)}%`],
              }))}
              onEdit={handleEditBenefitFactor}
              onDelete={handleDeleteBenefitFactor}
              canEdit={canEdit}
            />
            <p className="text-[11px] text-muted-foreground mt-2">A R100k grant counts at 100%, but a R100k interest-free loan counts at 70% (since it's repaid).</p>
          </div>
        </SectionToggle>

        <SectionToggle
          title={`Socio-Economic Development (max ${p.sed.maxPoints} pts)`}
          description="CSI contributions as percentage of net profit"
          open={!!openSections['sed']}
          onToggle={() => toggle('sed')}
        >
          <p className="text-[12px] text-muted-foreground">Measures contributions to socio-economic development (CSI) projects that benefit communities.</p>
          <div className="space-y-1 divide-y divide-border/20">
            <ParamRow label="Maximum Points" hint="Total available for SED contributions" value={p.sed.maxPoints} suffix="pts" disabled={!canEdit} onChange={v => updateParam('sed', 'maxPoints', v)} />
            <ParamRow label="NPAT Target" hint="% of net profit to contribute to SED" value={toDisplay(p.sed.npatTarget, true)} suffix="%" disabled={!canEdit} onChange={v => updateParam('sed', 'npatTarget', v, true)} />
          </div>
          <div className="flex items-start gap-2 bg-muted/30 rounded-lg p-3">
            <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-[11px] text-muted-foreground">Contributing 1% of NPAT earns full points. If your company has negative NPAT, deemed NPAT (based on industry norms) is used instead.</p>
          </div>
        </SectionToggle>

        <SectionToggle
          title="Sub-minimum & Discounting Rules"
          description="What happens when priority pillars fall below threshold"
          open={!!openSections['discounting']}
          onToggle={() => toggle('discounting')}
        >
          <p className="text-[12px] text-muted-foreground">Three priority elements have sub-minimum requirements. If any falls below 40% of its net target, your B-BBEE level is discounted (dropped) by one level.</p>
          <div className="space-y-3">
            <div className="rounded-lg border border-border/40 overflow-hidden text-[13px]">
              <div className="grid grid-cols-3 bg-muted/40 border-b border-border/30 px-3 py-1.5">
                <div className="text-xs font-medium text-muted-foreground">Priority Pillar</div>
                <div className="text-xs font-medium text-muted-foreground text-right">40% Threshold</div>
                <div className="text-xs font-medium text-muted-foreground text-right">Of Max</div>
              </div>
              <div className="grid grid-cols-3 px-3 py-1.5 border-b border-border/20">
                <div>Ownership (Net Value)</div>
                <div className="text-right tabular-nums">{p.ownership.subMinNetValue} pts</div>
                <div className="text-right tabular-nums text-muted-foreground">{p.ownership.netValueMax} pts</div>
              </div>
              <div className="grid grid-cols-3 px-3 py-1.5 border-b border-border/20">
                <div>Skills Development</div>
                <div className="text-right tabular-nums">{p.skills.subMinThreshold} pts</div>
                <div className="text-right tabular-nums text-muted-foreground">{p.skills.generalMax} pts</div>
              </div>
              <div className="grid grid-cols-3 px-3 py-1.5">
                <div>Preferential Procurement</div>
                <div className="text-right tabular-nums">{p.procurement.subMinThreshold} pts</div>
                <div className="text-right tabular-nums text-muted-foreground">{p.procurement.baseMax + p.procurement.bonusMax} pts</div>
              </div>
            </div>
            <div className="space-y-1.5 divide-y divide-border/20">
              <ParamRow label="Levels Dropped" hint="How many levels are deducted per sub-min failure" value={p.discounting.dropLevels} disabled={!canEdit} onChange={v => updateParam('discounting', 'dropLevels', v)} />
              <ParamRow label="Maximum Drop To" hint="Discounting can't push you below this level" value={`Level ${p.discounting.maxDropLevel}`} disabled />
            </div>
            <div className="flex items-start gap-2 bg-destructive/5 dark:bg-destructive/10 rounded-lg p-3">
              <Info className="h-3.5 w-3.5 text-destructive/60 mt-0.5 shrink-0" />
              <p className="text-[11px] text-muted-foreground">Example: If you score Level 3 but fail the Skills sub-minimum, you get discounted to Level 4. Discounting never pushes you to Non-Compliant — that only happens when total points are below 40.</p>
            </div>
          </div>
        </SectionToggle>

        <SectionToggle
          title="Deemed NPAT (Industry Norms)"
          description="When actual profit is used vs calculated profit"
          open={!!openSections['deemed']}
          onToggle={() => toggle('deemed')}
        >
          <p className="text-[12px] text-muted-foreground">When importing Excel data, the pipeline checks your profit margin. If it's very low or negative, "deemed NPAT" (calculated from industry norms) is used for ESD and SED targets instead.</p>
          <div className="space-y-3">
            <div className="rounded-lg border border-border/40 p-3 space-y-2 text-[13px]">
              <div className="font-medium">When is Deemed NPAT used?</div>
              <div className="text-muted-foreground text-[12px] space-y-1">
                <p>1. Your actual NPAT is zero or negative, OR</p>
                <p>2. Your actual profit margin is less than 25% of your industry norm</p>
              </div>
              <div className="font-medium pt-1">How is it calculated?</div>
              <div className="text-muted-foreground text-[12px]">
                <p>Deemed NPAT = Revenue x Industry Norm %</p>
              </div>
            </div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[12px] font-medium text-muted-foreground">Industry Norms</p>
              {canEdit && (
                <div className="flex gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => handleGenerateAI('industryNorm')}
                    disabled={isGenerating === 'industryNorm'}
                  >
                    {isGenerating === 'industryNorm' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    AI Suggest
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleAddIndustryNorm}>
                    <Plus className="h-3 w-3" /> Add
                  </Button>
                </div>
              )}
            </div>
            <EditableTable
              headers={["Industry", "Norm %"]}
              rows={p.industryNorms.map((n, i) => ({
                id: i,
                cells: [n.name, n.norm],
              }))}
              onEdit={handleEditIndustryNorm}
              onDelete={handleDeleteIndustryNorm}
              canEdit={canEdit}
            />
            <div className="flex items-start gap-2 bg-muted/30 rounded-lg p-3">
              <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-[11px] text-muted-foreground">Example: A transport company with R192M revenue and negative profit would use Deemed NPAT = R192M x 2.69% = R5.16M for ESD/SED targets.</p>
            </div>
          </div>
        </SectionToggle>
      </div>

      {canEdit && (
        <div className="pb-6">
          <Button className="w-full gap-2 rounded-full h-10" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? "Saving Parameters..." : "Save Scoring Rules"}
          </Button>
        </div>
      )}
      </div>

      <div className={activeView === 'calculations' ? '' : 'hidden'}>
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-heading font-semibold">Calculation Formulas</h2>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
            <Calculator className="h-3 w-3" />
            B-BBEE Methodology
          </div>
        </div>
      </div>

      {canEdit && (
        <div className="flex items-start gap-2 bg-primary/5 dark:bg-primary/10 rounded-xl p-3">
          <Pencil className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
          <p className="text-[12px] text-muted-foreground">Edit mode active — click any formula to modify it for your verification methodology.</p>
        </div>
      )}

      <CalculationFormulasPanel canEdit={canEdit} />

      {canEdit && (
        <div className="pb-6">
          <Button className="w-full gap-2 rounded-full h-10" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? "Saving All Parameters..." : "Save All Parameters"}
          </Button>
        </div>
      )}
      </div>
    </motion.div>
  );
}

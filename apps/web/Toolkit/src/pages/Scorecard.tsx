import { useState, useMemo } from "react";
import { Switch } from "@toolkit/components/ui/switch";
import { Label } from "@toolkit/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@toolkit/components/ui/tooltip";
import { ChevronDown, ChevronRight, HelpCircle, Award, Shield, TrendingUp, Trophy, CheckCircle2, XCircle, AlertTriangle, Trash2, Loader2 } from "lucide-react";
import { useBbeeStore } from "@toolkit/lib/store";
import { CalculatorConfigBanner } from "@toolkit/components/layout/CalculatorConfigGate";
import { useAuth } from "@toolkit/lib/auth";
import { useActiveClient } from "@toolkit/lib/client-context";
import type { BreakdownLine, PillarScore } from "@toolkit/lib/types";
import { cn } from "@toolkit/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface SubIndicator {
  name: string;
  target: string;
  weighting: number;
  score: number;
  formula: string;
  isBonus?: boolean;
}

interface ScorecardElement {
  key: string;
  name: string;
  target: number;
  weighting: number;
  score: number;
  subMinimumMet?: boolean;
  subMinLabel?: string;
  subIndicators: SubIndicator[];
  accentColor: string;
  barColor: string;
}

const EMPTY_PILLAR = { score: 0, target: 0, weighting: 0, subMinimumMet: false };

/**
 * The breakdown for a pillar comes STRAIGHT from the calculator that scored it
 * (calculateScorecard attaches PillarScore.subLines + coverageNotes). The page
 * never re-runs a calculator — that is what let a Transport score be shown
 * against generic lines. Sub-lines already reconcile to the pillar score.
 */
function pillarSubIndicators(pillar?: (PillarScore & { coverageNotes?: string[] }) | null): SubIndicator[] {
  if (!pillar) return [];
  const lines: SubIndicator[] = (pillar.subLines ?? [])
    // An indicator this scorecard does not score — no weighting available AND
    // nothing earned — is not an indicator, it is noise. The sector configs
    // legitimately zero out bands that a given code does not measure (a QSE has
    // no board-voting line; FSC has no Senior/Middle/Junior), and rendering them
    // as "0% · 0 · 0.00" rows made a 15-point element look like a 13-row form and
    // buried the six lines that actually add up to the score. A row that CAN
    // never move the score cannot help the reader understand it.
    // Kept deliberately narrow: a line with no weighting but a non-zero score is
    // an anomaly the user must still see, so only 0/0 lines are dropped.
    .filter((sl: BreakdownLine) => !(sl.weighting === 0 && sl.score === 0))
    .map((sl: BreakdownLine) => ({
    name: sl.isBonus ? `★ ${sl.name}` : sl.name,
    target: sl.target,
    weighting: sl.weighting,
    score: sl.score,
    formula: sl.note ?? `Score: ${sl.score.toFixed(2)} / ${sl.weighting} pts`,
    isBonus: sl.isBonus,
  }));
  const notes: SubIndicator[] = (pillar.coverageNotes ?? []).map((note) => ({
    name: "  ⓘ Coverage note",
    target: "",
    weighting: 0,
    score: 0,
    formula: note,
  }));
  return [...lines, ...notes];
}

function fmt(value: number, full: boolean): string {
  if (value === null || value === undefined || isNaN(value)) return full ? "0.0000" : "0.00";
  return full ? value.toFixed(4) : value.toFixed(2);
}

function achievementPct(score: number, target: number): number {
  return target > 0 ? Math.min(100, (score / target) * 100) : 0;
}

/**
 * Split a pillar into BASE weighting and BONUS points.
 *
 * The Codes state an element's weighting and its bonus points SEPARATELY, and a
 * verification report prints them as separate columns (Target · Bonus · Actual ·
 * Achieved). Our sector configs merge them into one `maxPoints` — Transport QSE
 * ownership is 28 (25 base + 3 bonus), Employment Equity 27 (25 + 2). Showing the
 * merged number as "Weight" contradicts the gazette the client is measured
 * against, and — worse — it inflates the denominator: an entity that earns every
 * base point but no bonus showed 25/28 = 89% "At Risk" when it had in fact
 * achieved 100% of what the element is worth.
 *
 * The split is DERIVED, never hardcoded: the calculators already tag their bonus
 * indicators `isBonus` (Skills absorption 5, Preferential Procurement designated-
 * group 2, ED graduation 1 + jobs 1 — which reconciles 109 base + 9 bonus = 118,
 * the published generic total). Scoring is untouched: `score` remains the full
 * pillar total including bonus, exactly as it counts toward the grand total.
 *
 * `unidentifiedPoints` is the honesty valve. When a sector's sub-lines do not
 * account for the pillar's whole weighting, the remainder is points we cannot
 * attribute — that is reported as unknown rather than silently presented as base.
 */
function bonusSplit(el: ScorecardElement): {
  baseWeight: number;
  baseScore: number;
  bonusAvailable: number;
  bonusEarned: number;
  hasBonus: boolean;
  unidentifiedPoints: number;
} {
  const bonusLines = el.subIndicators.filter((s) => s.isBonus);
  const bonusAvailable = bonusLines.reduce((n, s) => n + (s.weighting || 0), 0);
  const bonusEarned = bonusLines.reduce((n, s) => n + (s.score || 0), 0);
  const lineSum = el.subIndicators.reduce((n, s) => n + (s.weighting || 0), 0);
  return {
    baseWeight: Math.max(0, el.weighting - bonusAvailable),
    baseScore: Math.max(0, el.score - bonusEarned),
    bonusAvailable,
    bonusEarned,
    hasBonus: bonusLines.length > 0,
    // Only meaningful when the pillar HAS sub-lines to reconcile against.
    unidentifiedPoints: lineSum > 0 ? Math.max(0, el.weighting - lineSum) : 0,
  };
}

function statusIcon(pctAchieved: number): { icon: typeof CheckCircle2; label: string; color: string } {
  if (pctAchieved >= 100) return { icon: CheckCircle2, label: "On Track", color: "text-emerald-500" };
  if (pctAchieved >= 70) return { icon: AlertTriangle, label: "At Risk", color: "text-amber-500" };
  return { icon: XCircle, label: "Critical", color: "text-destructive" };
}

export default function Scorecard() {
  const { scorecard, client } = useBbeeStore();
  const { user } = useAuth();
  const { activeClientId } = useActiveClient();
  const [wrapMode, setWrapMode] = useState(true);
  const [fullFigures, setFullFigures] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isAdmin = user?.role === 'admin';

  const handleDelete = async () => {
    if (!activeClientId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/processor-sessions/${activeClientId}`, { method: 'DELETE' });
      if (res.ok) {
        window.location.href = '/';
      }
    } catch {
      // silently fail — user can retry
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const toggleRow = (key: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Every row's breakdown is whatever calculateScorecard attached — the exact
  // lines the score was built from. No calculator runs on this page.
  const elements: ScorecardElement[] = useMemo(() => {
    const ee = scorecard.employmentEquity;
    const rows: ScorecardElement[] = [
      {
        key: "ownership",
        name: "Ownership",
        ...(scorecard.ownership || EMPTY_PILLAR),
        accentColor: "text-violet-500 dark:text-violet-400",
        barColor: "bg-violet-500",
        subIndicators: pillarSubIndicators(scorecard.ownership),
      },
      {
        key: "managementControl",
        // When EE is its own pillar (Transport), this row is Management Control
        // only; otherwise the generic calculator folds EE into it.
        name: ee ? "Management Control" : "Management Control & Employment Equity",
        ...(scorecard.managementControl || EMPTY_PILLAR),
        accentColor: "text-blue-500 dark:text-blue-400",
        barColor: "bg-blue-500",
        subIndicators: pillarSubIndicators(scorecard.managementControl),
      },
      ...(ee ? [{
        key: "employmentEquity",
        name: "Employment Equity",
        ...(ee || EMPTY_PILLAR),
        accentColor: "text-cyan-500 dark:text-cyan-400",
        barColor: "bg-cyan-500",
        subIndicators: pillarSubIndicators(ee),
      }] : []),
      {
        key: "skillsDevelopment",
        name: "Skills Development",
        ...(scorecard.skillsDevelopment || EMPTY_PILLAR),
        accentColor: "text-emerald-500 dark:text-emerald-400",
        barColor: "bg-emerald-500",
        subIndicators: pillarSubIndicators(scorecard.skillsDevelopment),
      },
      {
        key: "procurement",
        name: "Preferential Procurement",
        ...(scorecard.procurement || EMPTY_PILLAR),
        accentColor: "text-amber-500 dark:text-amber-400",
        barColor: "bg-amber-500",
        subIndicators: pillarSubIndicators(scorecard.procurement),
      },
      {
        key: "supplierDevelopment",
        name: "Supplier Development",
        ...(scorecard.supplierDevelopment || EMPTY_PILLAR),
        accentColor: "text-rose-500 dark:text-rose-400",
        barColor: "bg-rose-500",
        subIndicators: pillarSubIndicators(scorecard.supplierDevelopment),
      },
      {
        key: "enterpriseDevelopment",
        name: "Enterprise Development",
        ...(scorecard.enterpriseDevelopment || EMPTY_PILLAR),
        accentColor: "text-orange-500 dark:text-orange-400",
        barColor: "bg-orange-500",
        subIndicators: pillarSubIndicators(scorecard.enterpriseDevelopment),
      },
      {
        key: "socioEconomicDevelopment",
        name: "Socio-Economic Development",
        ...(scorecard.socioEconomicDevelopment || EMPTY_PILLAR),
        accentColor: "text-sky-500 dark:text-sky-400",
        barColor: "bg-sky-500",
        subMinLabel: "Grass-roots only (health, safety). Education = Skills Development.",
        subIndicators: pillarSubIndicators(scorecard.socioEconomicDevelopment),
      },
      // FSC-only pillars. They are SCORED and counted in the Grand Total
      // (store.ts), but had no row here — so on an FSC scorecard those points
      // appeared in the total out of nowhere and could not be traced. Rendered
      // only when the sector config produced them.
      ...(scorecard.accessToFinancialServices ? [{
        key: "accessToFinancialServices",
        name: "Access to Financial Services",
        ...scorecard.accessToFinancialServices,
        accentColor: "text-teal-500 dark:text-teal-400",
        barColor: "bg-teal-500",
        subIndicators: pillarSubIndicators(scorecard.accessToFinancialServices),
      }] : []),
      ...(scorecard.empowermentFinancing ? [{
        key: "empowermentFinancing",
        name: "Empowerment Financing",
        ...scorecard.empowermentFinancing,
        accentColor: "text-indigo-500 dark:text-indigo-400",
        barColor: "bg-indigo-500",
        subIndicators: pillarSubIndicators(scorecard.empowermentFinancing),
      }] : []),
      {
        key: "yesInitiative",
        name: "YES Initiative",
        ...(scorecard.yesInitiative || EMPTY_PILLAR),
        accentColor: "text-purple-500 dark:text-[#d1d1d6]",
        barColor: "bg-purple-500",
        subIndicators: pillarSubIndicators(scorecard.yesInitiative),
      },
    ];
    return rows;
  }, [scorecard]);

  const expandAll = () => {
    if (expandedRows.size === elements.length) {
      setExpandedRows(new Set());
    } else {
      setExpandedRows(new Set(elements.map(e => e.key)));
    }
  };

  const displayLevel = scorecard.isDiscounted ? scorecard.discountedLevel : scorecard.achievedLevel;
  const levelLabel = displayLevel >= 9 ? "Non-Compliant" : `Level ${displayLevel}`;
  const totalData = scorecard.total || EMPTY_PILLAR;
  const totalPct = totalData.weighting > 0 ? Math.min(100, (totalData.score / totalData.weighting) * 100) : 0;

  // Grand-total bonus, summed from the same per-element split the rows show, so
  // the footer can state the base total and the bonus separately (the workbooks'
  // own convention: "Grand Total (excl. Bonus Points)" + "Bonus Points").
  const totalBonus = useMemo(
    () => elements.reduce(
      (acc, el) => {
        const s = bonusSplit(el);
        return { earned: acc.earned + s.bonusEarned, available: acc.available + s.bonusAvailable };
      },
      { earned: 0, available: 0 },
    ),
    [elements],
  );

  /**
   * Sub-minimums, DERIVED from the pillars that actually carry one.
   *
   * This panel used to hardcode the GENERIC thresholds ("40% of 27 base",
   * "≥ 10.8 pts") against a fixed list of five pillars and print them for every
   * sector — so a Transport or FSC client read generic figures that do not apply
   * to it, sitting next to a pass/fail that came from its own sector config. It
   * also listed pillars a sector does not have (Transport has no Supplier
   * Development) and divided by hardcoded targets (25/29/10/7) unrelated to the
   * active config.
   *
   * Now it shows only pillars whose calculator actually computed a sub-minimum,
   * measured against that pillar's own base weighting. The threshold TEXT is
   * gone: the pass/fail is the calculator's, and we do not print a derivation we
   * cannot source per sector.
   */
  const subMinimumItems = useMemo(
    () => elements
      .filter((el) => typeof el.subMinimumMet === "boolean" && el.weighting > 0)
      .map((el) => ({
        name: el.name,
        met: el.subMinimumMet as boolean,
        score: el.score,
        base: bonusSplit(el).baseWeight,
        color: el.accentColor,
      })),
    [elements],
  );

  return (
    <TooltipProvider>
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto" data-testid="page-scorecard">
        <CalculatorConfigBanner />
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-heading font-bold tracking-tight" data-testid="text-scorecard-title">Full Scorecard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {client.name ? `${client.name} — ` : ''}Generic B-BBEE Scorecard (Amended Codes of Good Practice)
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch id="wrap-toggle" checked={wrapMode} onCheckedChange={setWrapMode} data-testid="toggle-wrap" />
              <Label htmlFor="wrap-toggle" className="text-xs text-muted-foreground cursor-pointer">Wrap</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="figures-toggle" checked={fullFigures} onCheckedChange={setFullFigures} data-testid="toggle-full-figures" />
              <Label htmlFor="figures-toggle" className="text-xs text-muted-foreground cursor-pointer">Full figures</Label>
            </div>
            {isAdmin && !showDeleteConfirm && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                data-testid="btn-delete-company"
                title="Delete this client"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Client
              </button>
            )}
            {isAdmin && showDeleteConfirm && (
              <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-1.5">
                <span className="text-xs text-destructive font-medium">Delete {client.name || 'this client'}?</span>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-2.5 py-1 rounded-md bg-destructive hover:bg-destructive/80 text-white text-xs font-semibold transition-colors disabled:opacity-60 inline-flex items-center gap-1"
                  data-testid="btn-confirm-delete"
                >
                  {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  {isDeleting ? 'Deleting…' : 'Yes, delete'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="px-2.5 py-1 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground text-xs font-medium transition-colors"
                  data-testid="btn-cancel-delete"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
          <div className="p-5 flex flex-col md:flex-row md:items-center gap-5 md:gap-8">
            <div className="flex items-center gap-4">
              <div className={cn(
                "h-16 w-16 rounded-2xl flex items-center justify-center shrink-0",
                displayLevel <= 3 ? "bg-emerald-500/10" : displayLevel <= 6 ? "bg-amber-500/10" : "bg-destructive/10"
              )}>
                <Trophy className={cn(
                  "h-7 w-7",
                  displayLevel <= 3 ? "text-emerald-500" : displayLevel <= 6 ? "text-amber-500" : "text-destructive"
                )} />
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">B-BBEE Status</div>
                <div className="text-xl font-heading font-bold" data-testid="text-level">{levelLabel}</div>
                {scorecard.isDiscounted && (
                  <div className="text-[11px] text-destructive font-medium">Discounted from Level {scorecard.achievedLevel}</div>
                )}
              </div>
            </div>

            <div className="h-10 w-px bg-border/50 hidden md:block" />

            <div className="flex-1 grid grid-cols-3 gap-5">
              <div>
                <div className="text-[11px] text-muted-foreground font-medium mb-0.5">Total Score</div>
                <div className="text-xl font-bold tabular-nums" data-testid="text-total-score">{fmt(scorecard.total.score, fullFigures)}</div>
                <div className="flex items-center gap-1.5 mt-1">
                  <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${totalPct}%` }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{scorecard.total.weighting}</span>
                </div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground font-medium mb-0.5">Recognition</div>
                <div className="text-xl font-bold tabular-nums" data-testid="text-recognition">{scorecard.recognitionLevel}</div>
                <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  Procurement multiplier
                </div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground font-medium mb-0.5">Sub-minimum</div>
                <div className={cn(
                  "text-xl font-bold",
                  scorecard.isDiscounted ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
                )}>
                  {scorecard.isDiscounted ? "Discounted" : "Clear"}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  5 priority elements
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/30">
            <div>
              <h2 className="text-sm font-semibold">Generic Scorecard Translation</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">Click any row to expand sub-indicators with formulas.</p>
            </div>
            <button
              onClick={expandAll}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
              data-testid="btn-expand-all"
            >
              {expandedRows.size === elements.length ? "Collapse all" : "Expand all"}
            </button>
          </div>

          <div className={wrapMode ? "" : "overflow-x-auto"}>
            <table className={cn("w-full text-sm", wrapMode && "table-fixed")}>
              <thead>
                <tr className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                  <th className={cn("px-4 py-2.5 text-left border-b border-border/30", wrapMode ? "w-[32%]" : "min-w-[220px]")}>Element</th>
                  <th className="px-4 py-2.5 text-right border-b border-border/30 w-[9%]">Target</th>
                  <th className="px-4 py-2.5 text-right border-b border-border/30 w-[9%]">Weight</th>
                  <th className="px-4 py-2.5 text-right border-b border-border/30 w-[10%]">Bonus</th>
                  <th className="px-4 py-2.5 text-right border-b border-border/30 w-[13%]">Score</th>
                  <th className="px-4 py-2.5 text-right border-b border-border/30 w-[10%]">% Achieved</th>
                  <th className="px-4 py-2.5 text-center border-b border-border/30 w-[10%]">Status</th>
                  <th className="px-4 py-2.5 text-center border-b border-border/30 w-[14%]">Sub-min</th>
                </tr>
              </thead>
              <tbody>
                {elements.map((el) => (
                  <ElementRow
                    key={el.key}
                    element={el}
                    isExpanded={expandedRows.has(el.key)}
                    onToggle={() => toggleRow(el.key)}
                    fullFigures={fullFigures}
                    wrapMode={wrapMode}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-primary/20">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2 font-bold text-primary">
                      <Award className="h-4 w-4" />
                      Grand Total
                    </div>
                  </td>
                  {/* Base total — the workbooks' own "Grand Total (excl. Bonus Points)". */}
                  <td className="px-4 py-3.5 text-right text-muted-foreground font-mono text-xs">
                    {Math.max(0, scorecard.total.target - totalBonus.available)}
                  </td>
                  <td className="px-4 py-3.5 text-right text-muted-foreground font-mono text-xs">
                    {Math.max(0, scorecard.total.weighting - totalBonus.available)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-xs tabular-nums" data-testid="text-scorecard-bonus">
                    {totalBonus.available > 0 ? (
                      <span className={cn(totalBonus.earned > 0 ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-muted-foreground")}>
                        {fmt(totalBonus.earned, fullFigures)} / {totalBonus.available}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/30">—</span>
                    )}
                  </td>
                  {/* Score stays the FULL total incl. bonus — this is the number
                      that determines the level, and it is unchanged. */}
                  <td className="px-4 py-3.5 text-right">
                    <span className="font-bold font-mono text-base text-primary tabular-nums" data-testid="text-scorecard-total">
                      {fmt(scorecard.total.score, fullFigures)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-xs font-bold text-primary">
                    {totalPct.toFixed(1)}%
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    {(() => {
                      const st = statusIcon(totalPct);
                      const Icon = st.icon;
                      return (
                        <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold uppercase", st.color)}>
                          <Icon className="h-3 w-3" />
                          {st.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    {scorecard.isDiscounted ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-destructive font-bold uppercase" data-testid="badge-discounted">
                        <XCircle className="h-3 w-3" />
                        Discounted
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase" data-testid="badge-no-discount">
                        <CheckCircle2 className="h-3 w-3" />
                        No Discount
                      </span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40 bg-muted/30">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Priority Elements — Sub-minimum Compliance
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Priority elements must meet 40% threshold. Level discounted by 1 if any of the 5 sub-minimums fail.
            </p>
          </div>
          <div className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {subMinimumItems.map(sm => (
              <div
                key={sm.name}
                className="rounded-lg border border-border/40 p-3.5"
                data-testid={`submin-${sm.name.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={cn("text-xs font-semibold", sm.color)}>{sm.name}</span>
                  {sm.met ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" />
                      Passed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-destructive">
                      <XCircle className="h-3 w-3" />
                      Failed
                    </span>
                  )}
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-lg font-bold tabular-nums">{sm.score.toFixed(2)}</div>
                    <div className="text-[10px] text-muted-foreground">of {sm.base} base points</div>
                  </div>
                  <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center">
                    <span className="text-[10px] font-bold tabular-nums text-muted-foreground">
                      {sm.base > 0 ? Math.round((sm.score / sm.base) * 100) : 0}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

function ElementRow({ element, isExpanded, onToggle, fullFigures, wrapMode }: {
  element: ScorecardElement;
  isExpanded: boolean;
  onToggle: () => void;
  fullFigures: boolean;
  wrapMode: boolean;
}) {
  const el = element;
  const split = bonusSplit(el);
  // Achievement is measured against what the element is WORTH (its base
  // weighting), with bonus reported separately — otherwise earning every base
  // point still reads as a shortfall.
  const achievement = achievementPct(split.baseScore, split.baseWeight);
  // Nothing to win here: a level-boost element (YES) or an unchosen elective.
  const notPointScored = split.baseWeight === 0 && split.bonusAvailable === 0;
  const st = statusIcon(achievement);
  const StatusIcon = st.icon;

  return (
    <>
      <tr
        className="hover:bg-muted/20 transition-colors cursor-pointer group border-b border-border/20 last:border-b-0"
        onClick={onToggle}
        data-testid={`row-element-${el.key}`}
      >
        <td className={cn("px-4 py-3", wrapMode && "break-words")}>
          <div className="flex items-center gap-2">
            <div className="shrink-0">
              {isExpanded
                ? <ChevronDown className="h-3.5 w-3.5 text-primary" />
                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground" />
              }
            </div>
            <span className={cn("font-medium text-[13px]", isExpanded && el.accentColor)}>{el.name}</span>
          </div>
        </td>
        {/* Target/Weight show the element's BASE points — the figure the Codes
            state for this element. Bonus is its own column below. */}
        <td className="px-4 py-3 text-right text-muted-foreground font-mono text-xs">{split.baseWeight}</td>
        <td className="px-4 py-3 text-right text-muted-foreground font-mono text-xs">
          {split.baseWeight}
          {split.unidentifiedPoints > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="ml-1 text-amber-500 cursor-help" data-testid={`unattributed-${el.key}`}>?</span>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[260px] text-[11px]">
                <p>
                  {split.unidentifiedPoints} of this element&apos;s {el.weighting} points are not
                  accounted for by its listed indicators, so we cannot yet tell you which of them are
                  bonus points. The score is unaffected — only this base/bonus split is unverified
                  for this sector.
                </p>
              </TooltipContent>
            </Tooltip>
          )}
        </td>
        {/* BONUS — separate from the weighting, as the Codes and a verification
            report present it. "—" means no bonus indicator was identified for
            this element, which is not the same claim as "zero bonus available". */}
        <td className="px-4 py-3 text-right font-mono text-xs tabular-nums" data-testid={`bonus-${el.key}`}>
          {split.hasBonus ? (
            <span className={cn(split.bonusEarned > 0 ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-muted-foreground")}>
              {fmt(split.bonusEarned, fullFigures)} / {split.bonusAvailable}
            </span>
          ) : (
            <span className="text-muted-foreground/30">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <div className="hidden sm:block w-12 h-1 rounded-full bg-muted overflow-hidden">
              <div className={cn("h-full rounded-full transition-all duration-500", el.barColor)} style={{ width: `${achievement}%` }} />
            </div>
            <span className="font-mono font-bold text-[13px] tabular-nums">{fmt(el.score, fullFigures)}</span>
            {el.subMinLabel && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3 w-3 text-muted-foreground/30 hover:text-primary cursor-help shrink-0" data-testid={`tooltip-${el.key}`} />
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[250px] text-[11px]">
                  <p>{el.subMinLabel}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </td>
        {/* An element with no points to win is not "Critical" — it is not scored
            on points at all. YES is a LEVEL BOOST (weighting 0 by design), and an
            unchosen elective on a best-N-of-7 scorecard likewise carries no
            weight. Both used to render a red Critical badge and 0.0%, which reads
            as failure where there is nothing to fail. */}
        <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
          {notPointScored ? <span className="text-muted-foreground/30">—</span> : `${achievement.toFixed(1)}%`}
        </td>
        <td className="px-4 py-3 text-center">
          {notPointScored ? (
            <span className="text-muted-foreground/30 text-xs">—</span>
          ) : (
            <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold uppercase", st.color)}>
              <StatusIcon className="h-3 w-3" />
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-center">
          {'subMinimumMet' in el && el.subMinimumMet === false ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-destructive font-bold uppercase">
              <XCircle className="h-3 w-3" />
              Failed
            </span>
          ) : 'subMinimumMet' in el && el.subMinimumMet === true ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase">
              <CheckCircle2 className="h-3 w-3" />
              Passed
            </span>
          ) : (
            <span className="text-muted-foreground/30 text-xs">—</span>
          )}
        </td>
      </tr>
      <AnimatePresence>
        {isExpanded && (
          <tr>
            <td colSpan={8} className="p-0">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="bg-muted/10 border-b border-border/20">
                  <table className={cn("w-full text-xs", wrapMode && "table-fixed")}>
                    <tbody>
                      {el.subIndicators.map((sub, idx) => (
                        <tr key={idx} className={cn("hover:bg-muted/15 border-b border-border/10 last:border-b-0", sub.isBonus && "bg-amber-50/30 dark:bg-amber-950/10")}>
                          <td className={cn("px-4 py-2 pl-11 text-muted-foreground", wrapMode ? "w-[32%] break-words" : "min-w-[220px]")}>
                            {sub.name}
                          </td>
                          <td className="px-4 py-2 text-right text-muted-foreground/50 font-mono w-[10%]">{sub.target}</td>
                          <td className="px-4 py-2 text-right text-muted-foreground/50 font-mono w-[10%]">{sub.weighting}</td>
                          <td className="px-4 py-2 text-right w-[14%]">
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="font-mono font-semibold text-foreground/70 tabular-nums">{fmt(sub.score, fullFigures)}</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-3 w-3 text-muted-foreground/25 hover:text-primary cursor-help shrink-0" />
                                </TooltipTrigger>
                                <TooltipContent side="left" className="max-w-[280px] text-[11px]">
                                  <p>{sub.formula}</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right text-muted-foreground/50 font-mono w-[10%]">
                            {sub.weighting > 0 ? `${achievementPct(sub.score, sub.weighting).toFixed(0)}%` : ''}
                          </td>
                          <td className="px-4 py-2 w-[10%]"></td>
                          <td className="px-4 py-2 w-[14%]"></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
}

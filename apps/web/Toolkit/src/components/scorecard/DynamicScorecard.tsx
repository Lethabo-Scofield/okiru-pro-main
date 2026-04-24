/**
 * Dynamic Scorecard Component
 *
 * Renders scorecard dynamically based on API-provided structure.
 * Fetches pillar configuration and calculated scores from the backend.
 */

import { useState, useEffect, useCallback } from "react";
import { ChevronDown, ChevronRight, HelpCircle, Award, TrendingUp, Trophy, CheckCircle2, XCircle, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Switch } from "@toolkit/components/ui/switch";
import { Label } from "@toolkit/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@toolkit/components/ui/tooltip";
import { Button } from "@toolkit/components/ui/button";
import { cn } from "@toolkit/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

// Types from API
interface SubIndicator {
  key: string;
  name: string;
  description?: string;
  target: number;
  weighting: number;
  score: number;
  achieved: number;
  formula?: string;
}

interface PillarStructure {
  key: string;
  name: string;
  description?: string;
  weighting: number;
  target?: number;
  subMinimum?: number;
  subMinimumRequired?: boolean;
  indicators: SubIndicator[];
  accentColor: string;
  barColor: string;
  icon?: string;
}

interface ScorecardStructure {
  graphKey: string;
  scorecardKey: string;
  templateName: string;
  sectorCode: string;
  scorecardType: string;
  pillars: PillarStructure[];
  totalWeighting: number;
}

interface PillarScore {
  key: string;
  score: number;
  achieved: number;
  percentage: number;
  subMinimumMet: boolean;
  indicators: SubIndicator[];
}

interface ScorecardScores {
  total: {
    score: number;
    maxPossible: number;
    percentage: number;
  };
  pillars: Record<string, PillarScore>;
  beeLevel?: string;
  recognition?: string;
}

interface DynamicScorecardProps {
  graphKey: string;
  entityMap?: Record<string, unknown>;
  onCalculate?: () => void;
  className?: string;
}

// Helper functions
function fmt(value: number, full: boolean): string {
  if (value === null || value === undefined || isNaN(value)) return "0.00";
  return full ? value.toFixed(4) : value.toFixed(2);
}

function pct(value: number): string {
  if (value === null || value === undefined || isNaN(value)) return "0.0%";
  return `${(value * 100).toFixed(1)}%`;
}

function achievementPct(score: number, target: number): number {
  if (!target || target <= 0) return 0;
  return Math.min(100, (score / target) * 100);
}

function statusIcon(pctAchieved: number): { icon: typeof CheckCircle2; label: string; color: string } {
  if (pctAchieved >= 100) return { icon: CheckCircle2, label: "On Track", color: "text-emerald-500" };
  if (pctAchieved >= 70) return { icon: AlertTriangle, label: "At Risk", color: "text-amber-500" };
  return { icon: XCircle, label: "Critical", color: "text-destructive" };
}

// Icon mapping
const ICON_MAP: Record<string, typeof Trophy> = {
  trophy: Trophy,
  award: Award,
  "trending-up": TrendingUp,
  shield: Award,
  star: Trophy,
};

export function DynamicScorecard({ graphKey, entityMap, onCalculate, className }: DynamicScorecardProps) {
  const [structure, setStructure] = useState<ScorecardStructure | null>(null);
  const [scores, setScores] = useState<ScorecardScores | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullFigures, setFullFigures] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Fetch scorecard structure
  const fetchStructure = useCallback(async () => {
    try {
      const response = await fetch(`/api/templates/${graphKey}/structure`);
      if (!response.ok) {
        throw new Error(`Failed to fetch structure: ${response.statusText}`);
      }
      const data = await response.json();
      setStructure(data.structure);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scorecard structure");
    }
  }, [graphKey]);

  // Calculate scores
  const calculateScores = useCallback(async () => {
    setCalculating(true);
    try {
      const response = await fetch(`/api/templates/${graphKey}/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          overrides: entityMap,
          includeFormulaDetails: false,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Calculation failed: ${error}`);
      }

      const data = await response.json();
      setScores(data.scores);
      onCalculate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to calculate scores");
    } finally {
      setCalculating(false);
    }
  }, [graphKey, entityMap, onCalculate]);

  // Initial load
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchStructure();
      await calculateScores();
      setLoading(false);
    };
    load();
  }, [fetchStructure, calculateScores]);

  const toggleRow = (key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Loading state
  if (loading) {
    return (
      <div className={cn("flex items-center justify-center p-12", className)}>
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading scorecard...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={cn("p-6", className)}>
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-destructive mt-0.5" />
            <div>
              <h3 className="font-medium text-destructive">Error Loading Scorecard</h3>
              <p className="text-sm text-destructive/80 mt-1">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => {
                  setError(null);
                  setLoading(true);
                  fetchStructure().then(() => calculateScores()).finally(() => setLoading(false));
                }}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!structure || !scores) {
    return (
      <div className={cn("p-6", className)}>
        <p className="text-muted-foreground">No scorecard data available.</p>
      </div>
    );
  }

  const totalScore = scores.total?.score ?? 0;
  const totalMax = scores.total?.maxPossible ?? 0;
  const totalPct = totalMax > 0 ? (totalScore / totalMax) * 100 : 0;

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("space-y-6", className)}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">{structure.templateName}</h2>
            <p className="text-muted-foreground text-sm">
              {structure.sectorCode} - {structure.scorecardType}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="full-figures"
                checked={fullFigures}
                onCheckedChange={setFullFigures}
              />
              <Label htmlFor="full-figures" className="text-sm cursor-pointer">
                Full Precision
              </Label>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => calculateScores()}
              disabled={calculating}
            >
              {calculating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Recalculate
            </Button>
          </div>
        </div>

        {/* Total Score Card */}
        <div className="bg-gradient-to-br from-primary/10 to-primary/5 border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/20 rounded-lg">
                <Trophy className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Total B-BBEE Score</h3>
                {scores.beeLevel && (
                  <p className="text-sm text-muted-foreground">
                    Level {scores.beeLevel} {scores.recognition && `(${scores.recognition})`}
                  </p>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold">{totalScore.toFixed(1)}</p>
              <p className="text-sm text-muted-foreground">of {totalMax} points</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-muted rounded-full h-3 mb-2">
            <motion.div
              className="h-full bg-primary rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, totalPct)}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0 points</span>
            <span>{totalPct.toFixed(1)}% achieved</span>
            <span>{totalMax} points</span>
          </div>
        </div>

        {/* Pillars */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Scorecard Elements</h3>

          {structure.pillars.map((pillar) => {
            const pillarScore = scores.pillars[pillar.key];
            if (!pillarScore) return null;

            const score = pillarScore.score;
            const target = pillar.target ?? pillar.weighting;
            const pctAchieved = achievementPct(score, target);
            const { icon: StatusIcon, label, color } = statusIcon(pctAchieved);
            const isExpanded = expandedRows.has(pillar.key);
            const IconComponent = pillar.icon ? (ICON_MAP[pillar.icon] || Trophy) : Trophy;

            return (
              <motion.div
                key={pillar.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "border rounded-lg overflow-hidden",
                  isExpanded && "ring-1 ring-primary"
                )}
              >
                {/* Header Row */}
                <button
                  onClick={() => toggleRow(pillar.key)}
                  className="w-full p-4 flex items-center gap-4 hover:bg-muted/50 transition-colors"
                >
                  <div className={cn("p-2 rounded-lg", pillar.accentColor)}>
                    <IconComponent className="w-5 h-5" />
                  </div>

                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{pillar.name}</span>
                      {pillarScore.subMinimumMet !== undefined && (
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full",
                          pillarScore.subMinimumMet
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-700"
                        )}>
                          {pillarScore.subMinimumMet ? "Sub-min Met" : "Sub-min Not Met"}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Weighting: {pillar.weighting} points
                    </p>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="font-semibold">{fmt(score, fullFigures)}</p>
                      <p className="text-xs text-muted-foreground">of {fmt(target, fullFigures)}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <StatusIcon className={cn("w-5 h-5", color)} />
                      <span className="text-xs text-muted-foreground w-16 text-right">{label}</span>
                    </div>

                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {/* Progress Bar */}
                <div className="px-4 pb-3">
                  <div className="w-full bg-muted rounded-full h-2">
                    <motion.div
                      className={cn("h-full rounded-full", pillar.barColor)}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, pctAchieved)}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 text-right">
                    {pctAchieved.toFixed(1)}% of target
                  </p>
                </div>

                {/* Expanded Indicators */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-t bg-muted/30"
                    >
                      <div className="p-4 space-y-3">
                        {pillarScore.indicators.map((indicator) => (
                          <div key={indicator.key} className="flex items-center gap-4">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-xs">
                                {indicator.description || indicator.name}
                                {indicator.formula && (
                                  <p className="text-xs text-muted-foreground mt-1 font-mono">
                                    Formula: {indicator.formula}
                                  </p>
                                )}
                              </TooltipContent>
                            </Tooltip>

                            <div className="flex-1">
                              <p className="text-sm font-medium">{indicator.name}</p>
                              <p className="text-xs text-muted-foreground">
                                Target: {fmt(indicator.target, fullFigures)} | Weighting: {indicator.weighting}
                              </p>
                            </div>

                            <div className="text-right">
                              <p className={cn(
                                "text-sm font-medium",
                                indicator.score > 0 ? "text-emerald-600" : "text-muted-foreground"
                              )}>
                                {fmt(indicator.score, fullFigures)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {pct(indicator.achieved)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        {/* Summary Footer */}
        <div className="bg-muted rounded-lg p-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{totalScore.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">Total Points</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{scores.beeLevel || "-"}</p>
              <p className="text-xs text-muted-foreground">B-BBEE Level</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{scores.recognition || "-"}</p>
              <p className="text-xs text-muted-foreground">Recognition Level</p>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default DynamicScorecard;

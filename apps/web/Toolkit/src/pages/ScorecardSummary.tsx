import { useMemo } from "react";
import { Award, Trophy, TrendingUp, CheckCircle2, XCircle, Shield, ArrowLeft, Download } from "lucide-react";
import { useBbeeStore } from "@toolkit/lib/store";
import { useAuth } from "@toolkit/lib/auth";
import { calculateOwnershipScore } from "@toolkit/lib/calculators/ownership";
import { calculateManagementScore } from "@toolkit/lib/calculators/management";
import { calculateSkillsScore } from "@toolkit/lib/calculators/skills";
import { calculateProcurementScore } from "@toolkit/lib/calculators/procurement";
import { calculateEsdScore, calculateSedScore } from "@toolkit/lib/calculators/esd-sed";
import { cn } from "@toolkit/lib/utils";
import { Button } from "@toolkit/components/ui/button";

interface PillarSummary {
  key: string;
  name: string;
  score: number;
  weighting: number;
  target: number;
  percentage: number;
  accentColor: string;
  barColor: string;
  subMinimumMet?: boolean;
}

function fmt(value: number): string {
  return value.toFixed(2);
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export default function ScorecardSummary() {
  const { scorecard, ownership, management, skills, procurement, esd, sed, client } = useBbeeStore();
  const { user } = useAuth();

  const ownResult = useMemo(() => calculateOwnershipScore(ownership), [ownership]);
  const mgtResult = useMemo(() => calculateManagementScore(management), [management]);
  const skillResult = useMemo(() => calculateSkillsScore(skills), [skills]);
  const procResult = useMemo(() => calculateProcurementScore(procurement), [procurement]);
  const esdResult = useMemo(() => calculateEsdScore(esd, client.npat), [esd, client.npat]);
  const sedResult = useMemo(() => calculateSedScore(sed, client.npat), [sed, client.npat]);

  const pillars: PillarSummary[] = [
    {
      key: "ownership",
      name: "Ownership",
      score: scorecard.ownership.score,
      weighting: scorecard.ownership.weighting,
      target: scorecard.ownership.target,
      percentage: scorecard.ownership.weighting > 0 ? (scorecard.ownership.score / scorecard.ownership.weighting) * 100 : 0,
      accentColor: "text-violet-500 dark:text-violet-400",
      barColor: "bg-violet-500",
      subMinimumMet: scorecard.ownership.subMinimumMet,
    },
    {
      key: "managementControl",
      name: "Management Control",
      score: scorecard.managementControl.score,
      weighting: scorecard.managementControl.weighting,
      target: scorecard.managementControl.target,
      percentage: scorecard.managementControl.weighting > 0 ? (scorecard.managementControl.score / scorecard.managementControl.weighting) * 100 : 0,
      accentColor: "text-blue-500 dark:text-blue-400",
      barColor: "bg-blue-500",
    },
    {
      key: "skillsDevelopment",
      name: "Skills Development",
      score: scorecard.skillsDevelopment.score,
      weighting: scorecard.skillsDevelopment.weighting,
      target: scorecard.skillsDevelopment.target,
      percentage: scorecard.skillsDevelopment.weighting > 0 ? (scorecard.skillsDevelopment.score / scorecard.skillsDevelopment.weighting) * 100 : 0,
      accentColor: "text-emerald-500 dark:text-emerald-400",
      barColor: "bg-emerald-500",
      subMinimumMet: scorecard.skillsDevelopment.subMinimumMet,
    },
    {
      key: "procurement",
      name: "Preferential Procurement",
      score: scorecard.procurement.score,
      weighting: scorecard.procurement.weighting,
      target: scorecard.procurement.target,
      percentage: scorecard.procurement.weighting > 0 ? (scorecard.procurement.score / scorecard.procurement.weighting) * 100 : 0,
      accentColor: "text-amber-500 dark:text-amber-400",
      barColor: "bg-amber-500",
      subMinimumMet: scorecard.procurement.subMinimumMet,
    },
    {
      key: "supplierDevelopment",
      name: "Supplier Development",
      score: scorecard.supplierDevelopment.score,
      weighting: scorecard.supplierDevelopment.weighting,
      target: scorecard.supplierDevelopment.target,
      percentage: scorecard.supplierDevelopment.weighting > 0 ? (scorecard.supplierDevelopment.score / scorecard.supplierDevelopment.weighting) * 100 : 0,
      accentColor: "text-rose-500 dark:text-rose-400",
      barColor: "bg-rose-500",
      subMinimumMet: scorecard.supplierDevelopment.subMinimumMet,
    },
    {
      key: "enterpriseDevelopment",
      name: "Enterprise Development",
      score: scorecard.enterpriseDevelopment.score,
      weighting: scorecard.enterpriseDevelopment.weighting,
      target: scorecard.enterpriseDevelopment.target,
      percentage: scorecard.enterpriseDevelopment.weighting > 0 ? (scorecard.enterpriseDevelopment.score / scorecard.enterpriseDevelopment.weighting) * 100 : 0,
      accentColor: "text-orange-500 dark:text-orange-400",
      barColor: "bg-orange-500",
      subMinimumMet: scorecard.enterpriseDevelopment.subMinimumMet,
    },
    {
      key: "socioEconomicDevelopment",
      name: "Socio-Economic Development",
      score: scorecard.socioEconomicDevelopment.score,
      weighting: scorecard.socioEconomicDevelopment.weighting,
      target: scorecard.socioEconomicDevelopment.target,
      percentage: scorecard.socioEconomicDevelopment.weighting > 0 ? (scorecard.socioEconomicDevelopment.score / scorecard.socioEconomicDevelopment.weighting) * 100 : 0,
      accentColor: "text-sky-500 dark:text-sky-400",
      barColor: "bg-sky-500",
    },
    {
      key: "yesInitiative",
      name: "YES Initiative",
      score: scorecard.yesInitiative.score,
      weighting: scorecard.yesInitiative.weighting,
      target: scorecard.yesInitiative.target,
      percentage: scorecard.yesInitiative.weighting > 0 ? (scorecard.yesInitiative.score / scorecard.yesInitiative.weighting) * 100 : 0,
      accentColor: "text-purple-500 dark:text-purple-400",
      barColor: "bg-purple-500",
    },
  ];

  const displayLevel = scorecard.isDiscounted ? scorecard.discountedLevel : scorecard.achievedLevel;
  const levelLabel = displayLevel >= 9 ? "Non-Compliant" : `Level ${displayLevel}`;
  const totalPct = scorecard.total.weighting > 0 ? Math.min(100, (scorecard.total.score / scorecard.total.weighting) * 100) : 0;

  const subMinimumItems = [
    { name: "Ownership", threshold: "≥ 10 pts", met: scorecard.ownership.subMinimumMet, score: scorecard.ownership.score, target: 25 },
    { name: "Skills Dev", threshold: "≥ 10 pts", met: scorecard.skillsDevelopment.subMinimumMet, score: scorecard.skillsDevelopment.score, target: 25 },
    { name: "Procurement", threshold: "≥ 11.6 pts", met: scorecard.procurement.subMinimumMet, score: scorecard.procurement.score, target: 29 },
    { name: "Supplier Dev", threshold: "≥ 4 pts", met: scorecard.supplierDevelopment.subMinimumMet, score: scorecard.supplierDevelopment.score, target: 10 },
    { name: "Enterprise Dev", threshold: "≥ 2 pts", met: scorecard.enterpriseDevelopment.subMinimumMet, score: scorecard.enterpriseDevelopment.score, target: 7 },
  ];

  const handleExport = () => {
    // Export functionality would go here
    console.log("Export scorecard");
  };

  const handleBack = () => {
    window.history.back();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <Button variant="ghost" size="sm" onClick={handleBack} className="mb-2 -ml-2 text-muted-foreground">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <h1 className="text-3xl font-heading font-bold tracking-tight">Scorecard Summary</h1>
            <p className="text-muted-foreground mt-1">
              {client.name ? `${client.name} — ` : ''}B-BBEE Verification Complete
            </p>
          </div>
          <Button onClick={handleExport} variant="outline" className="shrink-0">
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>

        {/* Main Scorecard Card */}
        <div className="rounded-2xl border border-border/50 bg-card shadow-lg overflow-hidden">
          <div className="p-8">
            <div className="flex flex-col lg:flex-row lg:items-center gap-8">
              {/* Level Badge */}
              <div className="flex items-center gap-5">
                <div className={cn(
                  "h-24 w-24 rounded-2xl flex items-center justify-center shrink-0 shadow-inner",
                  displayLevel <= 3 ? "bg-emerald-500/15" : displayLevel <= 6 ? "bg-amber-500/15" : "bg-destructive/15"
                )}>
                  <Trophy className={cn(
                    "h-10 w-10",
                    displayLevel <= 3 ? "text-emerald-500" : displayLevel <= 6 ? "text-amber-500" : "text-destructive"
                  )} />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground font-medium uppercase tracking-wider">B-BBEE Status</div>
                  <div className="text-3xl font-heading font-bold mt-1" data-testid="summary-level">{levelLabel}</div>
                  {scorecard.isDiscounted && (
                    <div className="text-sm text-destructive font-medium mt-1">
                      Discounted from Level {scorecard.achievedLevel}
                    </div>
                  )}
                </div>
              </div>

              <div className="hidden lg:block h-20 w-px bg-border/50" />

              {/* Key Metrics */}
              <div className="flex-1 grid grid-cols-3 gap-6">
                <div>
                  <div className="text-sm text-muted-foreground font-medium mb-1">Total Score</div>
                  <div className="text-3xl font-bold tabular-nums" data-testid="summary-total-score">
                    {fmt(scorecard.total.score)}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                      <div 
                        className="h-full rounded-full bg-primary transition-all duration-700" 
                        style={{ width: `${totalPct}%` }} 
                      />
                    </div>
                    <span className="text-sm text-muted-foreground tabular-nums">/{scorecard.total.weighting}</span>
                  </div>
                </div>

                <div>
                  <div className="text-sm text-muted-foreground font-medium mb-1">Recognition</div>
                  <div className="text-3xl font-bold tabular-nums" data-testid="summary-recognition">
                    {scorecard.recognitionLevel}
                  </div>
                  <div className="text-sm text-muted-foreground mt-2 flex items-center gap-1">
                    <TrendingUp className="h-4 w-4" />
                    Procurement multiplier
                  </div>
                </div>

                <div>
                  <div className="text-sm text-muted-foreground font-medium mb-1">Sub-minimum</div>
                  <div className={cn(
                    "text-3xl font-bold",
                    scorecard.isDiscounted ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
                  )}>
                    {scorecard.isDiscounted ? "Discounted" : "Clear"}
                  </div>
                  <div className="text-sm text-muted-foreground mt-2">
                    5 priority elements
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Pillar Scores */}
          <div className="border-t border-border/50 bg-muted/30">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Award className="h-5 w-5 text-primary" />
                Scorecard Breakdown
              </h2>
              <div className="grid gap-3">
                {pillars.map((pillar) => (
                  <div 
                    key={pillar.key}
                    className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border/40 hover:border-border/60 transition-colors"
                  >
                    <div className={cn("w-3 h-12 rounded-full", pillar.barColor)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn("font-semibold", pillar.accentColor)}>{pillar.name}</span>
                        <span className="text-sm font-mono tabular-nums">
                          {fmt(pillar.score)} / {pillar.weighting}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                          <div 
                            className={cn("h-full rounded-full transition-all duration-500", pillar.barColor)} 
                            style={{ width: `${Math.min(100, pillar.percentage)}%` }} 
                          />
                        </div>
                        <span className="text-sm text-muted-foreground w-12 text-right">
                          {pillar.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    {pillar.subMinimumMet !== undefined && (
                      <div className="shrink-0">
                        {pillar.subMinimumMet ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-4 w-4" />
                            Met
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                            <XCircle className="h-4 w-4" />
                            Failed
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Sub-minimum Compliance */}
        <div className="rounded-2xl border border-border/50 bg-card shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border/40 bg-muted/30">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Priority Elements — Sub-minimum Compliance
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Priority elements must meet 40% threshold. Level discounted by 1 if any of the 5 sub-minimums fail.
            </p>
          </div>
          <div className="p-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {subMinimumItems.map(sm => (
              <div
                key={sm.name}
                className="rounded-xl border border-border/40 p-4 bg-muted/20"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-foreground">{sm.name}</span>
                  {sm.met ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Passed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-destructive">
                      <XCircle className="h-3.5 w-3.5" />
                      Failed
                    </span>
                  )}
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-2xl font-bold tabular-nums">{sm.score.toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground">{sm.threshold} of {sm.target}</div>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center">
                    <span className="text-xs font-bold tabular-nums text-muted-foreground">
                      {Math.round((sm.score / sm.target) * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Button size="lg" onClick={handleExport} className="w-full sm:w-auto">
            <Download className="h-5 w-5 mr-2" />
            Download Full Report
          </Button>
          <Button size="lg" variant="outline" onClick={() => window.location.href = '/dashboard'} className="w-full sm:w-auto">
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}

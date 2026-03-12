import { Button } from "@toolkit/components/ui/button";
import { Skeleton } from "@toolkit/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@toolkit/components/ui/tooltip";
import { FileSpreadsheet, ArrowRight, Upload, Table, Users, UserCog, BookOpen, ShoppingCart, Handshake, HeartHandshake, PlusCircle, TrendingDown, DollarSign, Info } from "lucide-react";
import { useBbeeStore } from "@toolkit/lib/store";
import type { Client, SkillsData, ProcurementData, ESDData, SEDData, ScorecardResult } from "@toolkit/lib/types";
import { calculateSkillsScore } from "@toolkit/lib/calculators/skills";
import { calculateProcurementScore } from "@toolkit/lib/calculators/procurement";
import { calculateEsdScore, calculateSedScore } from "@toolkit/lib/calculators/esd-sed";
import { cn, formatRand } from "@toolkit/lib/utils";
import { motion } from "framer-motion";
import { useLocation } from "wouter";

function formatLevel(level: number): string {
  if (level >= 9) return 'Non-Compliant';
  return `Level ${level}`;
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as const } }
};

const pillarMeta = [
  { key: "ownership", name: "Ownership", icon: Users, color: "from-violet-500 to-purple-600", iconBg: "bg-violet-500/15", iconColor: "text-violet-400", barColor: "bg-violet-500" },
  { key: "managementControl", name: "Management Control", icon: UserCog, color: "from-blue-500 to-cyan-500", iconBg: "bg-blue-500/15", iconColor: "text-blue-400", barColor: "bg-blue-500" },
  { key: "skillsDevelopment", name: "Skills Development", icon: BookOpen, color: "from-emerald-400 to-green-500", iconBg: "bg-emerald-500/15", iconColor: "text-emerald-400", barColor: "bg-emerald-500" },
  { key: "procurement", name: "Procurement", icon: ShoppingCart, color: "from-amber-400 to-orange-500", iconBg: "bg-amber-500/15", iconColor: "text-amber-400", barColor: "bg-amber-500" },
  { key: "supplierDevelopment", name: "Supplier Development", icon: Handshake, color: "from-rose-400 to-pink-500", iconBg: "bg-rose-500/15", iconColor: "text-rose-400", barColor: "bg-rose-500" },
  { key: "enterpriseDevelopment", name: "Enterprise Development", icon: Handshake, color: "from-orange-400 to-red-500", iconBg: "bg-orange-500/15", iconColor: "text-orange-400", barColor: "bg-orange-500" },
  { key: "socioEconomicDevelopment", name: "Socio-Economic Dev", icon: HeartHandshake, color: "from-fuchsia-400 to-purple-500", iconBg: "bg-fuchsia-500/15", iconColor: "text-fuchsia-400", barColor: "bg-fuchsia-500" },
];

function DashboardSkeleton() {
  return (
    <div className="space-y-7 max-w-4xl mx-auto" data-testid="dashboard-skeleton">
      <div>
        <Skeleton className="h-6 w-32 mb-1.5" />
        <Skeleton className="h-4 w-56" />
      </div>

      <div className="rounded-2xl border border-border/40 bg-card p-6">
        <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-10">
          <div className="flex items-center gap-5">
            <Skeleton className="h-18 w-18 rounded-2xl" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
          <div className="flex-1 grid grid-cols-3 gap-6 md:border-l md:pl-10 border-border/20">
            {[1, 2, 3].map(i => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-3 w-10" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <Skeleton className="h-4 w-28 mb-3" />
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6, 7].map(i => (
            <div key={i} className="rounded-xl border border-border/30 bg-card p-4 space-y-3">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-7 w-7 rounded-lg" />
                <Skeleton className="h-4 w-28" />
              </div>
              <div className="flex items-end justify-between">
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-4 w-10" />
              </div>
              <Skeleton className="h-1 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-border/30 bg-card p-5 space-y-3">
          <Skeleton className="h-4 w-24" />
          <div className="space-y-2">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        </div>
        <div className="rounded-xl border border-border/30 bg-card p-5 space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-8 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}

interface CostPerPointEntry {
  pillar: string;
  spend: number;
  points: number;
  costPerPoint: number;
  color: string;
  iconBg: string;
  iconColor: string;
  icon: typeof DollarSign;
  route: string;
}

export default function Dashboard() {
  const { scorecard, client, skills, procurement, esd, sed, isLoaded } = useBbeeStore();
  const [, navigate] = useLocation();

  if (client.id && !isLoaded) {
    return <DashboardSkeleton />;
  }

  const hasData = isLoaded && client.id && (
    scorecard.total.score > 0 ||
    scorecard.ownership.score > 0 ||
    scorecard.managementControl.score > 0 ||
    scorecard.skillsDevelopment.score > 0 ||
    scorecard.procurement.score > 0
  );

  if (!hasData) {
    return (
      <motion.div
        className="max-w-sm mx-auto py-28 text-center"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={item} className="space-y-5">
          <div className="h-12 w-12 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto">
            <Upload className="h-6 w-6 text-muted-foreground/40" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-heading font-semibold">Get started</h1>
            <p className="text-[13px] text-muted-foreground/60 max-w-xs mx-auto leading-relaxed">
              Upload your B-BBEE Excel toolkit to see your compliance scorecard.
            </p>
          </div>
          <Button
            className="gap-2 rounded-full px-6 h-9 text-[13px]"
            onClick={() => navigate("/import")}
            data-testid="btn-upload-excel"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Upload Excel
          </Button>
        </motion.div>
      </motion.div>
    );
  }

  const displayLevel = scorecard.isDiscounted ? scorecard.discountedLevel : scorecard.achievedLevel;

  const getLevelGrade = (level: number) => {
    if (level <= 1) return { label: "Excellent", color: "text-emerald-400" };
    if (level <= 3) return { label: "Good", color: "text-violet-400" };
    if (level <= 5) return { label: "Moderate", color: "text-amber-400" };
    if (level <= 8) return { label: "Needs work", color: "text-orange-400" };
    return { label: "Non-Compliant", color: "text-destructive" };
  };

  const grade = getLevelGrade(displayLevel);

  return (
    <motion.div
      className="space-y-7 max-w-4xl mx-auto"
      variants={container}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={item}>
        <h1 className="text-lg font-heading font-semibold tracking-tight">Dashboard</h1>
        <p className="text-[13px] text-muted-foreground/50 mt-0.5">Your B-BBEE compliance overview.</p>
      </motion.div>

      <motion.div variants={item} className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-6">
        <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-10">
          <div className="flex items-center gap-5">
            <div className="h-16 w-16 rounded-2xl flex items-center justify-center bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-purple-500/20">
              <span className="text-2xl font-heading font-bold text-white">
                {displayLevel >= 9 ? "NC" : displayLevel}
              </span>
            </div>
            <div>
              <h2 className="text-base font-heading font-semibold">{formatLevel(displayLevel)}</h2>
              <p className={cn("text-[12px] font-medium", grade.color)}>{grade.label}</p>
              {scorecard.isDiscounted && (
                <p className="text-[11px] text-destructive/70 mt-0.5">Discounted from {formatLevel(scorecard.achievedLevel)}</p>
              )}
            </div>
          </div>

          <div className="flex-1 grid grid-cols-3 gap-6 md:border-l md:pl-10 border-primary/10">
            <div>
              <div className="text-[11px] text-muted-foreground/60 mb-0.5">Score</div>
              <div className="text-xl font-heading font-bold tabular-nums">{scorecard.total.score.toFixed(1)}</div>
              <div className="text-[11px] text-muted-foreground/40">of {scorecard.total.weighting}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground/60 mb-0.5">Recognition</div>
              <div className="text-xl font-heading font-bold tabular-nums">{scorecard.recognitionLevel}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground/60 mb-0.5">Sub-minimum</div>
              <div className={cn("text-xl font-heading font-bold", scorecard.isDiscounted ? "text-destructive" : "text-emerald-400")}>
                {scorecard.isDiscounted ? "Failed" : "Passed"}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div variants={item}>
        <h3 className="text-[12px] font-medium text-muted-foreground/40 mb-3 px-0.5 tracking-wide">Pillar Breakdown</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {pillarMeta.map((p) => {
            const data = (scorecard as any)[p.key];
            if (!data) return null;
            const pct = Math.min(100, (data.score / data.weighting) * 100);
            const failedSubMin = data.subMinimumMet === false;

            return (
              <motion.div
                key={p.key}
                variants={item}
                className={cn(
                  "rounded-xl border border-border/30 bg-card p-4 space-y-3 hover:border-border/60 cursor-pointer group",
                  failedSubMin && "border-destructive/20"
                )}
                onClick={() => {
                  const routes: Record<string, string> = {
                    ownership: "/pillars/ownership",
                    managementControl: "/pillars/management",
                    skillsDevelopment: "/pillars/skills",
                    procurement: "/pillars/procurement",
                    enterpriseDevelopment: "/pillars/esd",
                    socioEconomicDevelopment: "/pillars/sed",
                  };
                  navigate(routes[p.key] || "/scorecard");
                }}
                data-testid={`card-pillar-${p.key}`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center", p.iconBg)}>
                    <p.icon className={cn("h-3.5 w-3.5", p.iconColor)} />
                  </div>
                  <span className="text-[13px] font-medium">{p.name}</span>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <span className={cn("text-lg font-heading font-bold tabular-nums", failedSubMin && "text-destructive")}>
                      {data.score.toFixed(1)}
                    </span>
                    <span className="text-[11px] text-muted-foreground/40 ml-1">/ {data.weighting}</span>
                  </div>
                  <span className={cn("text-[11px] font-medium tabular-nums", pct >= 60 ? "text-foreground/50" : "text-muted-foreground/40")}>
                    {pct.toFixed(0)}%
                  </span>
                </div>
                <div className="h-1.5 w-full bg-muted/30 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
                    className={cn(
                      "h-full rounded-full",
                      failedSubMin ? "bg-destructive/60" : p.barColor
                    )}
                  />
                </div>
                {failedSubMin && (
                  <p className="text-[10px] text-destructive/70 font-medium">Sub-minimum not met</p>
                )}
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      <CostPerPointSection
        client={client}
        skills={skills}
        procurement={procurement}
        esd={esd}
        sed={sed}
        scorecard={scorecard}
        navigate={navigate}
      />

      <div className="grid gap-3 md:grid-cols-2">
        <motion.div variants={item}>
          <div className="rounded-xl border border-border/30 bg-card p-5 space-y-3" data-testid="card-quick-actions">
            <h3 className="text-[12px] font-medium text-muted-foreground/40 tracking-wide">Quick Actions</h3>
            <div className="space-y-0.5">
              {[
                { label: "Re-import Data", desc: "Upload a new or updated toolkit", icon: FileSpreadsheet, href: "/import", testId: "btn-reimport", iconBg: "bg-emerald-500/15", iconColor: "text-emerald-400" },
                { label: "Full Scorecard", desc: "Pillar-by-pillar breakdown", icon: Table, href: "/scorecard", testId: "btn-view-scorecard", iconBg: "bg-blue-500/15", iconColor: "text-blue-400" },
              ].map((action) => (
                <button
                  key={action.testId}
                  className="flex items-center justify-between w-full p-2.5 rounded-lg hover:bg-muted/30 text-left group"
                  onClick={() => navigate(action.href)}
                  data-testid={action.testId}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center", action.iconBg)}>
                      <action.icon className={cn("h-3.5 w-3.5", action.iconColor)} />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium">{action.label}</p>
                      <p className="text-[11px] text-muted-foreground/50">{action.desc}</p>
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/20 group-hover:text-primary/60" />
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div variants={item}>
          <div className="rounded-xl border border-border/30 bg-card p-5 space-y-3" data-testid="card-scenario-planning">
            <h3 className="text-[12px] font-medium text-muted-foreground/40 tracking-wide">Scenario Planning</h3>
            <div className="rounded-lg border border-border/20 text-[13px] overflow-hidden">
              <div className="grid grid-cols-4 text-[11px] font-medium text-muted-foreground/40 border-b border-border/15 bg-muted/15 px-3 py-1.5">
                <div className="col-span-2">Scenario</div>
                <div className="text-right">Level</div>
                <div className="text-right">Points</div>
              </div>
              <div className="grid grid-cols-4 px-3 py-2 items-center">
                <div className="col-span-2 font-medium text-[13px] flex items-center gap-2">
                  Base (Current)
                  <span className="text-[9px] text-muted-foreground/50 bg-muted/40 px-1.5 py-0.5 rounded">Active</span>
                </div>
                <div className={cn("text-right text-[13px] font-medium", scorecard.isDiscounted && "text-destructive")}>
                  {formatLevel(displayLevel)}
                </div>
                <div className="text-right text-[13px] font-semibold tabular-nums">
                  {scorecard.total.score.toFixed(2)}
                </div>
              </div>
            </div>
            <Button className="w-full gap-2 h-8 text-[12px]" variant="outline" size="sm" onClick={() => navigate("/scenarios")} data-testid="btn-clone-base">
              <PlusCircle className="h-3 w-3" />
              Create Scenario
            </Button>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function CostPerPointSection({
  client,
  skills,
  procurement,
  esd,
  sed,
  scorecard,
  navigate,
}: {
  client: Client;
  skills: SkillsData;
  procurement: ProcurementData;
  esd: ESDData;
  sed: SEDData;
  scorecard: ScorecardResult;
  navigate: (path: string) => void;
}) {
  const skillsResult = calculateSkillsScore(skills);
  const procResult = calculateProcurementScore(procurement);
  const esdResult = calculateEsdScore(esd, client.npat);
  const sedResult = calculateSedScore(sed, client.npat);

  const totalSkillsSpend = skillsResult.actualSpend;
  const totalProcSpend = procResult.recognisedSpend;
  const totalEsdSpend = esdResult.sdSpend + esdResult.edSpend;
  const totalSedSpend = sedResult.actualSpend;

  const entries: CostPerPointEntry[] = [
    {
      pillar: "Skills Development",
      spend: totalSkillsSpend,
      points: skillsResult.total,
      costPerPoint: skillsResult.total > 0 ? totalSkillsSpend / skillsResult.total : 0,
      color: "from-emerald-400 to-green-500",
      iconBg: "bg-emerald-500/15",
      iconColor: "text-emerald-400",
      icon: BookOpen,
      route: "/pillars/skills",
    },
    {
      pillar: "Procurement",
      spend: totalProcSpend,
      points: procResult.total,
      costPerPoint: procResult.total > 0 ? totalProcSpend / procResult.total : 0,
      color: "from-amber-400 to-orange-500",
      iconBg: "bg-amber-500/15",
      iconColor: "text-amber-400",
      icon: ShoppingCart,
      route: "/pillars/procurement",
    },
    {
      pillar: "Enterprise & Supplier Dev",
      spend: totalEsdSpend,
      points: esdResult.total,
      costPerPoint: esdResult.total > 0 ? totalEsdSpend / esdResult.total : 0,
      color: "from-rose-400 to-pink-500",
      iconBg: "bg-rose-500/15",
      iconColor: "text-rose-400",
      icon: Handshake,
      route: "/pillars/esd",
    },
    {
      pillar: "Socio-Economic Dev",
      spend: totalSedSpend,
      points: sedResult.total,
      costPerPoint: sedResult.total > 0 ? totalSedSpend / sedResult.total : 0,
      color: "from-fuchsia-400 to-purple-500",
      iconBg: "bg-fuchsia-500/15",
      iconColor: "text-fuchsia-400",
      icon: HeartHandshake,
      route: "/pillars/sed",
    },
  ];

  const validEntries = entries.filter(e => e.spend > 0 && e.points > 0);
  const bestValue = validEntries.length > 0
    ? validEntries.reduce((min, e) => e.costPerPoint < min.costPerPoint ? e : min, validEntries[0])
    : null;

  const totalSpendAll = validEntries.reduce((acc, e) => acc + e.spend, 0);
  const totalPointsAll = validEntries.reduce((acc, e) => acc + e.points, 0);

  if (totalSpendAll === 0) return null;

  return (
    <motion.div variants={item} data-testid="section-cost-per-point">
      <div className="flex items-center gap-2 mb-3 px-0.5">
        <h3 className="text-[12px] font-medium text-muted-foreground/40 tracking-wide">Cost per Point</h3>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3 w-3 text-muted-foreground/30 cursor-help" data-testid="icon-cost-per-point-info" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-[220px] text-[11px]">
              <p>Shows the recognised Rand spend to earn each BEE point per pillar. Lower is better — it highlights where your spend delivers the most value.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
        <div className="grid grid-cols-12 text-[11px] font-medium text-muted-foreground/40 border-b border-border/15 bg-muted/15 px-4 py-2">
          <div className="col-span-4">Pillar</div>
          <div className="col-span-3 text-right">Spend</div>
          <div className="col-span-2 text-right">Points</div>
          <div className="col-span-3 text-right">R / Point</div>
        </div>

        {entries.map((entry) => {
          const isBest = bestValue && entry.pillar === bestValue.pillar;
          const hasData = entry.spend > 0 && entry.points > 0;

          return (
            <div
              key={entry.pillar}
              className={cn(
                "grid grid-cols-12 px-4 py-2.5 items-center border-b border-border/10 last:border-b-0 hover:bg-muted/20 cursor-pointer transition-colors",
                isBest && "bg-emerald-500/[0.03]"
              )}
              onClick={() => navigate(entry.route)}
              data-testid={`row-cost-${entry.pillar.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <div className="col-span-4 flex items-center gap-2">
                <div className={cn("h-6 w-6 rounded-md flex items-center justify-center shrink-0", entry.iconBg)}>
                  <entry.icon className={cn("h-3 w-3", entry.iconColor)} />
                </div>
                <span className="text-[12px] font-medium truncate">{entry.pillar}</span>
                {isBest && (
                  <span className="text-[9px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded shrink-0">Best value</span>
                )}
              </div>
              <div className="col-span-3 text-right text-[12px] tabular-nums text-muted-foreground/70">
                {hasData ? formatRand(entry.spend) : '—'}
              </div>
              <div className="col-span-2 text-right text-[12px] tabular-nums font-medium">
                {hasData ? entry.points.toFixed(1) : '—'}
              </div>
              <div className={cn(
                "col-span-3 text-right text-[12px] tabular-nums font-semibold",
                isBest ? "text-emerald-400" : hasData ? "text-foreground" : "text-muted-foreground/30"
              )}>
                {hasData ? formatRand(entry.costPerPoint) : '—'}
              </div>
            </div>
          );
        })}

        {totalPointsAll > 0 && (
          <div className="grid grid-cols-12 px-4 py-2.5 items-center bg-muted/10 border-t border-border/20">
            <div className="col-span-4 flex items-center gap-2">
              <div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 bg-primary/10">
                <TrendingDown className="h-3 w-3 text-primary" />
              </div>
              <span className="text-[12px] font-semibold">Overall</span>
            </div>
            <div className="col-span-3 text-right text-[12px] tabular-nums font-medium">
              {formatRand(totalSpendAll)}
            </div>
            <div className="col-span-2 text-right text-[12px] tabular-nums font-medium">
              {totalPointsAll.toFixed(1)}
            </div>
            <div className="col-span-3 text-right text-[12px] tabular-nums font-bold text-primary">
              {formatRand(totalSpendAll / totalPointsAll)}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

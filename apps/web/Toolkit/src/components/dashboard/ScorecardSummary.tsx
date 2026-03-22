import { useBbeeStore } from "@toolkit/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Skeleton } from "@toolkit/components/ui/skeleton";
import { Award, Target, ShieldCheck } from "lucide-react";
import { cn } from "@toolkit/lib/utils";
import { motion } from "framer-motion";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const item = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const } }
};

function formatLevel(level: number): string {
  return level >= 9 ? 'Non-Compliant' : `Level ${level}`;
}

function ScorecardSummarySkeleton() {
  return (
    <div className="space-y-4" data-testid="scorecard-skeleton">
      <div className="grid gap-3 md:grid-cols-3">
        {[1, 2, 3].map(i => (
          <Card key={i} className="glass-panel">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3.5 w-3.5 rounded" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-20 mb-1" />
              <Skeleton className="h-3 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="glass-panel">
        <CardHeader className="pb-3">
          <Skeleton className="h-4 w-36" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4, 5, 6, 7].map(i => (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="h-1 w-full rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function ScorecardSummary() {
  const { scorecard, isLoaded, client } = useBbeeStore();

  if (client.id && !isLoaded) {
    return <ScorecardSummarySkeleton />;
  }

  const { total, achievedLevel, discountedLevel, isDiscounted, recognitionLevel, ...pillars } = scorecard;

  const pillarsArray = [
    { name: "Ownership", key: "ownership" },
    { name: "Management Control", key: "managementControl" },
    { name: "Skills Development", key: "skillsDevelopment" },
    { name: "Preferential Procurement", key: "procurement" },
    { name: "Supplier Development", key: "supplierDevelopment" },
    { name: "Enterprise Development", key: "enterpriseDevelopment" },
    { name: "Socio-Economic Dev", key: "socioEconomicDevelopment" },
    { name: "YES Initiative", key: "yesInitiative" },
  ];

  return (
    <motion.div
      className="space-y-4"
      variants={container}
      initial="hidden"
      animate="show"
    >
      <div className="grid gap-3 md:grid-cols-3">
        <motion.div variants={item}>
          <Card className="glass-panel" data-testid="card-total-score">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[11px] font-medium text-muted-foreground/50">Total Score</CardTitle>
              <Target className="h-3.5 w-3.5 text-muted-foreground/20" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-heading font-bold tabular-nums">{total.score.toFixed(2)}</div>
              <p className="text-[11px] text-muted-foreground/35 mt-0.5">of {total.weighting}</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={item}>
          <Card className={cn("glass-panel", isDiscounted && "border-destructive/15")} data-testid="card-bee-level">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[11px] font-medium text-muted-foreground/50">B-BBEE Level</CardTitle>
              <Award className={cn("h-3.5 w-3.5", isDiscounted ? "text-destructive/30" : "text-muted-foreground/20")} />
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className={cn("text-xl font-heading font-bold", isDiscounted && "text-destructive")}>
                  {formatLevel(isDiscounted ? discountedLevel : achievedLevel)}
                </span>
                <span className="text-[11px] text-muted-foreground/35">{recognitionLevel}</span>
              </div>
              {isDiscounted && (
                <p className="text-[11px] text-destructive/50 mt-0.5">Discounted from {formatLevel(achievedLevel)}</p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={item}>
          <Card className="glass-panel" data-testid="card-compliance">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[11px] font-medium text-muted-foreground/50">Sub-minimum</CardTitle>
              <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground/20" />
            </CardHeader>
            <CardContent>
              {isDiscounted ? (
                <>
                  <div className="text-lg font-heading font-bold text-destructive">Failed</div>
                  <p className="text-[11px] text-muted-foreground/35 mt-0.5">Discounting applied</p>
                </>
              ) : (
                <>
                  <div className="text-lg font-heading font-bold text-foreground">Passed</div>
                  <p className="text-[11px] text-muted-foreground/35 mt-0.5">All sub-minimums met</p>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div variants={item}>
        <Card className="glass-panel" data-testid="card-pillar-breakdown">
          <CardHeader className="pb-3">
            <CardTitle className="text-[13px] font-medium">Scorecard Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {pillarsArray.map((pillar) => {
              // @ts-ignore
              const data = pillars[pillar.key];
              if (!data) return null;

              const percentage = Math.min(100, (data.score / data.weighting) * 100);
              const failedSubMin = data.subMinimumMet === false;

              return (
                <div key={pillar.key} className="space-y-1">
                  <div className="flex items-center justify-between text-[13px]">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground/65">{pillar.name}</span>
                      {failedSubMin && (
                        <span className="text-[10px] text-destructive/60 font-medium">Sub-min failed</span>
                      )}
                    </div>
                    <span className="text-muted-foreground tabular-nums text-[12px]">
                      <span className={cn("font-semibold", failedSubMin ? "text-destructive" : "text-foreground/80")}>
                        {data.score.toFixed(2)}
                      </span>
                      <span className="text-muted-foreground/30"> / {data.weighting}</span>
                    </span>
                  </div>
                  <div className="h-[3px] w-full bg-muted/35 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1], delay: 0.1 }}
                      className={cn(
                        "h-full rounded-full",
                        failedSubMin ? "bg-destructive/40" : "bg-foreground/14"
                      )}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

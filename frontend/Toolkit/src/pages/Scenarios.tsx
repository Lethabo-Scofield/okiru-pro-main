import { useState } from "react";
import { useBbeeStore } from "@toolkit/lib/store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@toolkit/components/ui/card";
import { Badge } from "@toolkit/components/ui/badge";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
import { Plus, ArrowRight, ArrowLeftRight, Trash2, Save, Play, CheckCircle2, TrendingUp, TrendingDown, RefreshCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@toolkit/components/ui/dialog";
import { useToast } from "@toolkit/hooks/use-toast";
import { format } from "date-fns";
import { ScorecardResult } from "@toolkit/lib/types";
import confetti from "canvas-confetti";

function formatLevel(level: number): string {
  return level >= 9 ? 'Non-Compliant' : `Level ${level}`;
}

export default function Scenarios() {
  const { 
    scenarios, 
    baseSnapshot,
    isScenarioMode,
    activeScenarioId,
    scorecard: currentScorecard,
    createScenario, 
    switchScenario, 
    deleteScenario 
  } = useBbeeStore();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState("");

  const handleCreate = () => {
    if (!newScenarioName) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    createScenario(newScenarioName);
    setNewScenarioName("");
    setIsCreateOpen(false);
    toast({ title: "Scenario created", description: "You are now editing the new scenario." });
  };

  const handleSwitch = (id: string | null) => {
    const isReturningToBase = id === null;
    
    // Check if activating a scenario that improves the level compared to base
    if (!isReturningToBase && baseSnapshot) {
      const scenario = scenarios.find(s => s.id === id);
      if (scenario && scenario.scorecard.discountedLevel < baseSnapshot.scorecard.discountedLevel) {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#10b981', '#3b82f6', '#f59e0b']
        });
      }
    }

    switchScenario(id);
    toast({ 
      title: isReturningToBase ? "Switched to Base Data" : "Scenario Active", 
      description: isReturningToBase ? "Any changes now affect the actual dataset." : "Changes are isolated to this scenario."
    });
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteScenario(id);
    toast({ title: "Scenario deleted" });
  };

  // The base scorecard is either currentScorecard (if not in scenario mode) or baseSnapshot.scorecard
  const baseScorecard = isScenarioMode && baseSnapshot ? baseSnapshot.scorecard : currentScorecard;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold">Scenario Planning</h1>
          <p className="text-muted-foreground mt-1">
            Simulate interventions to see their impact on your B-BBEE level.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isScenarioMode && (
            <Button variant="outline" onClick={() => handleSwitch(null)} className="gap-2">
              <ArrowLeftRight className="h-4 w-4" />
              Return to Base Data
            </Button>
          )}

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" data-testid="btn-create-scenario">
                <Plus className="h-4 w-4" />
                New Scenario
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Create Scenario</DialogTitle>
                <DialogDescription>
                  This will duplicate your current base data. Any changes made in the scenario will not affect your actual records.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Input 
                    placeholder="e.g. Hire 3 Black Executives in Q3" 
                    value={newScenarioName} 
                    onChange={e => setNewScenarioName(e.target.value)} 
                    autoFocus
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" onClick={handleCreate}>Create & Edit</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isScenarioMode && (
        <Card className="bg-primary/5 border-primary/20 mb-8">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Play className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-primary">Scenario Mode Active</p>
                <p className="text-sm text-muted-foreground">
                  Editing: <strong className="text-foreground">{scenarios.find(s => s.id === activeScenarioId)?.name}</strong>. Navigate to other pillars to make changes.
                </p>
              </div>
            </div>
            <Badge variant="outline" className="bg-background">Isolated Environment</Badge>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        {/* Base Data Card */}
        <Card className={`glass-panel cursor-pointer transition-all ${!isScenarioMode ? 'ring-2 ring-primary border-transparent' : 'hover:border-primary/50'}`}
              onClick={() => handleSwitch(null)}>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-xl">Base Data</CardTitle>
                <CardDescription>Your actual current standing</CardDescription>
              </div>
              {!isScenarioMode && <CheckCircle2 className="h-5 w-5 text-primary" />}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">B-BBEE Level</p>
                  <p className="text-3xl font-bold font-heading">{formatLevel(baseScorecard.discountedLevel)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground font-medium">Total Points</p>
                  <p className="text-xl font-bold font-mono">{baseScorecard.total.score.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Scenarios List */}
        {scenarios.map((scenario) => {
          const isActive = activeScenarioId === scenario.id;
          const pointsDelta = scenario.scorecard.total.score - baseScorecard.total.score;
          const levelDelta = baseScorecard.discountedLevel - scenario.scorecard.discountedLevel; // positive means improvement
          
          return (
            <Card 
              key={scenario.id} 
              className={`glass-panel cursor-pointer transition-all ${isActive ? 'ring-2 ring-primary border-transparent' : 'hover:border-primary/50'}`}
              onClick={() => handleSwitch(scenario.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-xl line-clamp-1" title={scenario.name}>{scenario.name}</CardTitle>
                    <CardDescription>{format(new Date(scenario.createdAt), 'dd MMM yyyy')}</CardDescription>
                  </div>
                  {isActive ? (
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                  ) : (
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0 -mt-1 -mr-2" onClick={(e) => handleDelete(scenario.id, e)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground font-medium">Projected Level</p>
                      <div className="flex items-center gap-2">
                        <p className="text-3xl font-bold font-heading">{formatLevel(scenario.scorecard.discountedLevel)}</p>
                        {levelDelta > 0 && (
                          <Badge className="bg-emerald-500 hover:bg-emerald-600">+{levelDelta} Levels</Badge>
                        )}
                        {levelDelta < 0 && (
                          <Badge variant="destructive">{levelDelta} Levels</Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground font-medium">Delta Points</p>
                      <p className={`text-xl font-bold font-mono ${pointsDelta > 0 ? 'text-emerald-500' : pointsDelta < 0 ? 'text-destructive' : ''}`}>
                        {pointsDelta > 0 ? '+' : ''}{pointsDelta.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isScenarioMode && activeScenarioId && (
        <Card className="glass-panel mt-8 border-primary/20">
          <CardHeader>
            <CardTitle>Scenario Comparison</CardTitle>
            <CardDescription>Compare your base data against {scenarios.find(s => s.id === activeScenarioId)?.name}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-muted-foreground w-1/3">Pillar</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Base Points</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Scenario Points</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Delta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[
                    { key: 'ownership', label: 'Ownership' },
                    { key: 'managementControl', label: 'Management Control' },
                    { key: 'skillsDevelopment', label: 'Skills Development' },
                    { key: 'procurement', label: 'Preferential Procurement' },
                    { key: 'enterpriseDevelopment', label: 'Enterprise & Supplier Dev' },
                    { key: 'socioEconomicDevelopment', label: 'Socio-Economic Development' },
                  ].map((pillar) => {
                    const baseVal = baseScorecard[pillar.key as keyof ScorecardResult];
                    const scenarioVal = currentScorecard[pillar.key as keyof ScorecardResult];
                    const basePoints = typeof baseVal === 'object' && baseVal !== null && 'score' in baseVal ? Number(baseVal.score) : 0;
                    const scenarioPoints = typeof scenarioVal === 'object' && scenarioVal !== null && 'score' in scenarioVal ? Number(scenarioVal.score) : 0;
                    const delta = scenarioPoints - basePoints;
                    
                    return (
                      <tr key={pillar.key} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{pillar.label}</td>
                        <td className="px-4 py-3 text-right font-mono">{basePoints.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-mono font-medium">{scenarioPoints.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right">
                          {delta !== 0 ? (
                            <Badge variant={delta > 0 ? "default" : "destructive"} className={delta > 0 ? "bg-emerald-500 hover:bg-emerald-600" : ""}>
                              {delta > 0 ? '+' : ''}{delta.toFixed(2)}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground font-mono">0.00</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-primary/5 font-bold border-t-2 border-primary/20">
                  <tr>
                    <td className="px-4 py-4 text-primary font-medium uppercase tracking-wider">Total Score</td>
                    <td className="px-4 py-4 text-right font-mono">{baseScorecard.total.score.toFixed(2)}</td>
                    <td className="px-4 py-4 text-right font-mono text-lg text-primary">{currentScorecard.total.score.toFixed(2)}</td>
                    <td className="px-4 py-4 text-right">
                      {currentScorecard.total.score - baseScorecard.total.score !== 0 ? (
                        <Badge 
                          variant={currentScorecard.total.score - baseScorecard.total.score > 0 ? "default" : "destructive"} 
                          className={`text-sm py-1 px-2 ${currentScorecard.total.score - baseScorecard.total.score > 0 ? "bg-emerald-500 hover:bg-emerald-600" : ""}`}
                        >
                          {currentScorecard.total.score - baseScorecard.total.score > 0 ? '+' : ''}
                          {(currentScorecard.total.score - baseScorecard.total.score).toFixed(2)}
                        </Badge>
                      ) : (
                         <span className="text-muted-foreground font-mono">0.00</span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

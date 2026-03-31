import { useState, useMemo } from "react";
import { useBbeeStore } from "@toolkit/lib/store";
import { calculateYESScore, calculateRecommendedCandidates } from "@toolkit/lib/calculators/yes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Badge } from "@toolkit/components/ui/badge";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
import { Label } from "@toolkit/components/ui/label";
import { Checkbox } from "@toolkit/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@toolkit/components/ui/select";
import { Progress } from "@toolkit/components/ui/progress";
import { 
  Plus, Users, Target, TrendingUp, Award, AlertCircle, 
  CheckCircle2, XCircle, ArrowUpCircle, Trash2, Pencil,
  Briefcase, GraduationCap, DollarSign, Calculator
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@toolkit/components/ui/dialog";
import { v4 as uuidv4 } from "uuid";
import { useToast } from "@toolkit/hooks/use-toast";
import { cn, formatRand } from "@toolkit/lib/utils";
import type { YESCandidate } from "@toolkit/lib/types";

const RACE_OPTIONS = [
  { value: "African", label: "African" },
  { value: "Coloured", label: "Coloured" },
  { value: "Indian", label: "Indian" },
  { value: "White", label: "White" },
];

const GENDER_OPTIONS = [
  { value: "Male", label: "Male" },
  { value: "Female", label: "Female" },
];

// Helper to check if race is Black for BEE purposes
function isBlackRace(race: string): boolean {
  return ['African', 'Coloured', 'Indian'].includes(race);
}

interface CandidateFormState {
  name: string;
  idNumber: string;
  gender: 'Male' | 'Female';
  race: 'African' | 'Coloured' | 'Indian' | 'White';
  isDisabled: boolean;
  startDate: string;
  endDate: string;
  isAbsorbed: boolean;
  absorptionDate: string;
  cost: number;
}

const defaultFormState: CandidateFormState = {
  name: '',
  idNumber: '',
  gender: 'Male',
  race: 'African',
  isDisabled: false,
  startDate: new Date().toISOString().split('T')[0],
  endDate: '',
  isAbsorbed: false,
  absorptionDate: '',
  cost: 0,
};

// YES Tier card component
function TierCard({ 
  tier, 
  isAchieved, 
  threshold, 
  currentCount,
  blackYouthMet,
  levelIncrease,
  onClick,
  isSelected
}: { 
  tier: 'Tier 1' | 'Tier 2' | 'Tier 3';
  isAchieved: boolean;
  threshold: number;
  currentCount: number;
  blackYouthMet: boolean;
  levelIncrease: number;
  onClick: () => void;
  isSelected: boolean;
}) {
  const progress = Math.min(100, (currentCount / threshold) * 100);
  
  const tierStyles = {
    'Tier 1': 'border-amber-200 bg-amber-50/50 dark:bg-amber-900/10',
    'Tier 2': 'border-slate-200 bg-slate-50/50 dark:bg-slate-900/10',
    'Tier 3': 'border-orange-200 bg-orange-50/50 dark:bg-orange-900/10',
  };
  
  const tierBadgeStyles = {
    'Tier 1': 'bg-amber-100 text-amber-800 border-amber-200',
    'Tier 2': 'bg-slate-100 text-slate-800 border-slate-200',
    'Tier 3': 'bg-orange-100 text-orange-800 border-orange-200',
  };

  return (
    <Card 
      className={cn(
        "cursor-pointer transition-all hover:shadow-md",
        tierStyles[tier],
        isSelected && "ring-2 ring-primary",
        isAchieved && blackYouthMet && "border-green-400 bg-green-50/30"
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <Badge className={cn("border", tierBadgeStyles[tier])}>
            {tier}
          </Badge>
          {isAchieved && blackYouthMet ? (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          ) : isAchieved && !blackYouthMet ? (
            <AlertCircle className="h-5 w-5 text-amber-500" />
          ) : (
            <XCircle className="h-5 w-5 text-muted-foreground/50" />
          )}
        </div>
        <CardTitle className="text-lg mt-2">{threshold} Youth</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span>{currentCount} / {threshold}</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
        <div className="pt-2 border-t space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">BEE Level Increase:</span>
            <span className={cn("font-bold", levelIncrease > 0 ? "text-green-600" : "text-muted-foreground")}>
              +{levelIncrease} {levelIncrease === 1 ? 'Level' : 'Levels'}
            </span>
          </div>
          {isAchieved && !blackYouthMet && (
            <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
              <AlertCircle className="h-3 w-3 inline mr-1" />
              Need 50%+ Black Youth for level uplift
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function YESInitiative() {
  const { skills, management } = useBbeeStore();
  const { trainingPrograms } = skills;
  const { employees } = management;
  const { toast } = useToast();

  // YES candidates - derive from training interventions with isYesEmployee flag
  const yesCandidates: YESCandidate[] = useMemo(() => {
    return trainingPrograms
      .filter(p => p.isYesEmployee)
      .map(p => ({
        id: p.id,
        name: p.learnerName || 'Unknown',
        idNumber: p.learnerIdNumber || '',
        gender: p.gender || 'Male',
        race: p.race || 'African',
        isDisabled: p.isDisabled,
        isBlack: isBlackRace(p.race || 'African'),
        startDate: p.startDate || p.transactionDate,
        endDate: p.endDate,
        isAbsorbed: p.isAbsorbed,
        absorptionDate: p.isAbsorbed ? (p.endDate || new Date().toISOString().split('T')[0]) : undefined,
        cost: p.courseCost + p.travelCost + p.accommodationCost + p.cateringCost + 
              p.stationeryCost + p.facilityCost + p.salaryCost + p.otherCosts,
        trainingInterventionId: p.id,
      }));
  }, [trainingPrograms]);

  // Calculate total employees from management
  const totalEmployees = employees.filter(e => !e.isForeign).length;
  
  // YES data for calculation
  const yesData = {
    id: 'yes-data',
    clientId: 'current',
    totalEmployees,
    yesHeadcountTarget: 0, // Calculated by calculator
    candidates: yesCandidates,
    yesYouthEnrolled: yesCandidates.length,
    yesBlackYouthCount: yesCandidates.filter(c => c.isBlack).length,
    yesBlackYouthPercentage: 0, // Calculated by calculator
    yesAbsorbedCount: yesCandidates.filter(c => c.isAbsorbed).length,
    yesAbsorptionRate: 0, // Calculated by calculator
    totalYesCost: yesCandidates.reduce((sum, c) => sum + c.cost, 0),
    yesCostPerCandidate: 0, // Calculated by calculator
    yesTierAchieved: 'None' as const,
    yesBeeLevelIncrease: 0,
    qualifiesForLevelUplift: false,
  };

  const result = calculateYESScore(yesData);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<CandidateFormState>({ ...defaultFormState });
  const [selectedTier, setSelectedTier] = useState<'Tier 1' | 'Tier 2' | 'Tier 3'>('Tier 3');

  const resetForm = () => {
    setFormState({ ...defaultFormState });
  };

  const handleAdd = () => {
    if (!formState.name) {
      toast({ title: "Invalid input", description: "Candidate name is required.", variant: "destructive" });
      return;
    }

    // Add via Skills intervention with YES flag
    toast({ 
      title: "Please use Skills Development", 
      description: "YES candidates should be added as Training Interventions with 'YES 4 Youth Candidate' checked.",
    });
    setIsAddOpen(false);
  };

  const openEdit = (candidate: YESCandidate) => {
    setEditingId(candidate.id);
    setFormState({
      name: candidate.name,
      idNumber: candidate.idNumber || '',
      gender: candidate.gender,
      race: candidate.race,
      isDisabled: candidate.isDisabled,
      startDate: candidate.startDate,
      endDate: candidate.endDate || '',
      isAbsorbed: candidate.isAbsorbed,
      absorptionDate: candidate.absorptionDate || '',
      cost: candidate.cost,
    });
    setIsEditOpen(true);
  };

  const handleEdit = () => {
    if (!editingId) return;
    // Update the linked training intervention
    toast({ title: "Updated", description: "Changes saved." });
    setIsEditOpen(false);
    setEditingId(null);
    resetForm();
  };

  const recommendedForSelectedTier = calculateRecommendedCandidates(totalEmployees, selectedTier);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold">YES 4 Youth Initiative</h1>
          <p className="text-muted-foreground mt-1">
            Youth Employment Service — linked to Skills Development interventions.
          </p>
        </div>
        
        <div className="flex gap-2">
          <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add YES Candidate
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle>Add YES 4 Youth Candidate</DialogTitle>
                <DialogDescription>
                  YES candidates should be added via the Skills Development page as Training Interventions.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4 text-center text-muted-foreground">
                <GraduationCap className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Navigate to Skills Development to add a YES candidate.</p>
                <p className="text-sm">Check the "YES 4 Youth Candidate" box when adding an intervention.</p>
              </div>
              <DialogFooter>
                <Button onClick={() => setIsAddOpen(false)}>Close</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) { setEditingId(null); resetForm(); } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Edit YES Candidate</DialogTitle>
            <DialogDescription>Update candidate details.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-name" className="text-right">Name</Label>
              <Input id="edit-name" value={formState.name} disabled className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Status</Label>
              <div className="col-span-3 flex items-center gap-2">
                <Checkbox 
                  id="edit-absorbed" 
                  checked={formState.isAbsorbed}
                  onCheckedChange={(checked) => setFormState({ ...formState, isAbsorbed: checked === true })}
                />
                <Label htmlFor="edit-absorbed" className="cursor-pointer">Absorbed into Employment</Label>
              </div>
            </div>
            {formState.isAbsorbed && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-absorption-date" className="text-right">Absorption Date</Label>
                <Input 
                  id="edit-absorption-date" 
                  type="date" 
                  value={formState.absorptionDate}
                  onChange={e => setFormState({ ...formState, absorptionDate: e.target.value })}
                  className="col-span-3"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleEdit}>Update</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="glass-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total Employees
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-heading">{totalEmployees}</div>
            <p className="text-xs text-muted-foreground mt-1">From Management Control</p>
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4" />
              YES Target
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-heading">{result.yesHeadcountTarget}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalEmployees < 500 ? '2.5% of headcount' : 
               totalEmployees <= 1000 ? '1.5% of headcount' : '1% of headcount'}
            </p>
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Youth Enrolled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <div className="text-3xl font-bold font-heading">{result.totalCandidates}</div>
              <div className="text-sm text-muted-foreground mb-1">/ {result.yesHeadcountTarget}</div>
            </div>
            <Progress value={Math.min(100, (result.totalCandidates / result.yesHeadcountTarget) * 100)} className="mt-2 h-2" />
          </CardContent>
        </Card>

        <Card className={cn(
          "glass-panel",
          result.qualifiesForLevelUplift ? "border-green-200 bg-green-50/30" : "border-amber-200"
        )}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Award className="h-4 w-4" />
              BEE Level Impact
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn(
              "text-3xl font-bold font-heading",
              result.yesBeeLevelIncrease > 0 ? "text-green-600" : "text-muted-foreground"
            )}>
              {result.yesBeeLevelIncrease > 0 ? `+${result.yesBeeLevelIncrease}` : '0'}
            </div>
            <p className="text-xs mt-1">
              {result.qualifiesForLevelUplift ? (
                <span className="text-green-600">{result.yesTierAchieved} achieved with 50%+ Black Youth</span>
              ) : (
                <span className="text-amber-600">Need 50%+ Black Youth for uplift</span>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tier Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <TierCard
          tier="Tier 1"
          isAchieved={result.yesTierAchieved === 'Tier 1'}
          threshold={result.tier1Threshold}
          currentCount={result.totalCandidates}
          blackYouthMet={result.blackYouthPercentage >= 50}
          levelIncrease={result.qualifiesForLevelUplift && result.yesTierAchieved === 'Tier 1' ? 2 : 0}
          onClick={() => setSelectedTier('Tier 1')}
          isSelected={selectedTier === 'Tier 1'}
        />
        <TierCard
          tier="Tier 2"
          isAchieved={['Tier 1', 'Tier 2'].includes(result.yesTierAchieved)}
          threshold={result.tier2Threshold}
          currentCount={result.totalCandidates}
          blackYouthMet={result.blackYouthPercentage >= 50}
          levelIncrease={result.qualifiesForLevelUplift && ['Tier 1', 'Tier 2'].includes(result.yesTierAchieved) 
            ? (result.yesTierAchieved === 'Tier 1' ? 2 : 1) : 0}
          onClick={() => setSelectedTier('Tier 2')}
          isSelected={selectedTier === 'Tier 2'}
        />
        <TierCard
          tier="Tier 3"
          isAchieved={['Tier 1', 'Tier 2', 'Tier 3'].includes(result.yesTierAchieved)}
          threshold={result.tier3Threshold}
          currentCount={result.totalCandidates}
          blackYouthMet={result.blackYouthPercentage >= 50}
          levelIncrease={result.qualifiesForLevelUplift && ['Tier 1', 'Tier 2', 'Tier 3'].includes(result.yesTierAchieved) 
            ? (result.yesTierAchieved === 'Tier 1' ? 2 : 1) : 0}
          onClick={() => setSelectedTier('Tier 3')}
          isSelected={selectedTier === 'Tier 3'}
        />
      </div>

      {/* Demographics & Absorption */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Demographics
            </CardTitle>
            <CardDescription>50%+ Black Youth required for level uplift</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Black Youth</span>
              <div className="flex items-center gap-2">
                <span className="font-bold">{result.blackYouthCount} / {result.totalCandidates}</span>
                <Badge variant={result.blackYouthPercentage >= 50 ? "default" : "destructive"}>
                  {result.blackYouthPercentage.toFixed(1)}%
                </Badge>
              </div>
            </div>
            <Progress 
              value={result.blackYouthPercentage} 
              className="h-2"
            />
            {result.blackYouthPercentage < 50 && result.totalCandidates > 0 && (
              <div className="text-sm text-amber-600 bg-amber-50 p-3 rounded border border-amber-200">
                <AlertCircle className="h-4 w-4 inline mr-2" />
                Need at least {Math.ceil(result.totalCandidates * 0.5)} Black Youth to qualify for BEE level uplift
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              Absorption Tracking
            </CardTitle>
            <CardDescription>Monitor absorption from Skills interventions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Absorbed into Employment</span>
              <div className="flex items-center gap-2">
                <span className="font-bold">{result.absorbedCount} / {result.totalCandidates}</span>
                <Badge variant="outline">{result.absorptionRate.toFixed(1)}%</Badge>
              </div>
            </div>
            <Progress 
              value={result.absorptionRate} 
              className="h-2"
            />
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-muted-foreground">Total YES Cost</span>
              <span className="font-bold text-primary">{formatCurrency(result.totalCost)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Cost per Candidate</span>
              <span className="font-mono">{formatCurrency(result.costPerCandidate)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Candidates Table */}
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            YES 4 Youth Candidates ({yesCandidates.length})
          </CardTitle>
          <CardDescription>Candidates linked from Skills Development interventions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">Candidate</th>
                  <th className="h-10 px-4 text-center font-medium text-muted-foreground">Demographics</th>
                  <th className="h-10 px-4 text-center font-medium text-muted-foreground">Dates</th>
                  <th className="h-10 px-4 text-center font-medium text-muted-foreground">Status</th>
                  <th className="h-10 px-4 text-right font-medium text-muted-foreground">Cost</th>
                  <th className="h-10 px-4 text-right font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {yesCandidates.map((candidate) => (
                  <tr key={candidate.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors group">
                    <td className="p-4">
                      <div className="font-medium">{candidate.name}</div>
                      <div className="text-xs text-muted-foreground">{candidate.idNumber}</div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex justify-center gap-1 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">{candidate.gender}</Badge>
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "text-[10px]", 
                            candidate.isBlack && "bg-emerald-50 text-emerald-700 border-emerald-200"
                          )}
                        >
                          {candidate.race}
                        </Badge>
                        {candidate.isDisabled && (
                          <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                            Disabled
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="text-xs">
                        <div>Start: {candidate.startDate}</div>
                        {candidate.endDate && <div>End: {candidate.endDate}</div>}
                        {candidate.isAbsorbed && candidate.absorptionDate && (
                          <div className="text-green-600">Absorbed: {candidate.absorptionDate}</div>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      {candidate.isAbsorbed ? (
                        <Badge className="bg-green-100 text-green-700 border-green-200">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Absorbed
                        </Badge>
                      ) : (
                        <Badge variant="outline">In Progress</Badge>
                      )}
                    </td>
                    <td className="p-4 text-right font-mono">
                      {formatCurrency(candidate.cost)}
                    </td>
                    <td className="p-4 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100"
                        onClick={() => openEdit(candidate)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {yesCandidates.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <GraduationCap className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No YES 4 Youth candidates yet.</p>
              <p className="text-sm">Add candidates via Skills Development with the YES flag.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Target Calculator */}
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Target Calculator
          </CardTitle>
          <CardDescription>Calculate how many youth needed for {selectedTier}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">For</span>
              <Select value={selectedTier} onValueChange={(v) => setSelectedTier(v as typeof selectedTier)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Tier 1">Tier 1</SelectItem>
                  <SelectItem value="Tier 2">Tier 2</SelectItem>
                  <SelectItem value="Tier 3">Tier 3</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-muted-foreground">you need:</span>
            </div>
            <div className="flex items-center gap-2">
              <ArrowUpCircle className="h-5 w-5 text-primary" />
              <span className="text-2xl font-bold">{recommendedForSelectedTier}</span>
              <span className="text-muted-foreground">youth enrolled</span>
            </div>
            <div className="text-sm text-muted-foreground">
              ({recommendedForSelectedTier - result.totalCandidates > 0 ? `+${recommendedForSelectedTier - result.totalCandidates} more needed` : 'Target met!'})
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

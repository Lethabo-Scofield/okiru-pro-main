import { useState } from "react";
import { useBbeeStore } from "@toolkit/lib/store";
import { calculateSkillsScore } from "@toolkit/lib/calculators/skills";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Badge } from "@toolkit/components/ui/badge";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
import { Label } from "@toolkit/components/ui/label";
import { Checkbox } from "@toolkit/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@toolkit/components/ui/select";
import { Plus, GraduationCap, Trash2, Pencil } from "lucide-react";
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
import type { TrainingProgram } from "@toolkit/lib/types";

const CATEGORY_OPTIONS = [
  { value: "A", label: "Cat A — Bursaries (University / TVET)" },
  { value: "B", label: "Cat B — Internships & Learnerships" },
  { value: "C", label: "Cat C — Short Courses & Workshops" },
  { value: "D", label: "Cat D — Other Accredited Training" },
  { value: "E", label: "Cat E — Non-accredited / Informal (≤25% cap)" },
  { value: "F", label: "Cat F — Other (Travel, Venue, Catering) (≤15% cap)" },
];

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

interface ProgramFormState {
  name: string;
  categoryCode: string;
  cost: number;
  isEmployed: boolean;
  isBlack: boolean;
  gender: string;
  race: string;
  isDisabled: boolean;
}

const defaultFormState: ProgramFormState = {
  name: '',
  categoryCode: 'C',
  cost: 0,
  isEmployed: true,
  isBlack: true,
  gender: '',
  race: '',
  isDisabled: false,
};

const categoryCodeToLegacy: Record<string, TrainingProgram['category']> = {
  A: 'bursary',
  B: 'learnership',
  C: 'short_course',
  D: 'other',
  E: 'other',
  F: 'other',
};

export default function SkillsDevelopment() {
  const { skills, addTrainingProgram, updateTrainingProgram, removeTrainingProgram } = useBbeeStore();
  const { leviableAmount, trainingPrograms } = skills;
  const { toast } = useToast();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<ProgramFormState>({ ...defaultFormState });

  const targetSpend = leviableAmount * 0.06; 
  const bursaryTarget = leviableAmount * 0.025; 
  
  const totalSpend = trainingPrograms.reduce((acc, prog) => acc + prog.cost, 0);
  const bursarySpend = trainingPrograms
    .filter(p => p.categoryCode === 'A' || p.category === 'bursary')
    .reduce((acc, prog) => acc + prog.cost, 0);

  const getCategoryColor = (code: string) => {
    switch(code) {
      case 'A': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800/50';
      case 'B': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800/50';
      case 'C': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200 dark:border-orange-800/50';
      case 'D': return 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300 border-teal-200 dark:border-teal-800/50';
      case 'E': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800/50';
      case 'F': return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700/50';
      default: return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700/50';
    }
  };

  const formatCategoryLabel = (prog: TrainingProgram) => {
    const code = prog.categoryCode || 'D';
    const found = CATEGORY_OPTIONS.find(c => c.value === code);
    return found ? found.label : `Cat ${code}`;
  };

  const formatCurrency = formatRand;

  const resetForm = () => {
    setFormState({ ...defaultFormState });
  };

  const handleAdd = () => {
    if (!formState.name || formState.cost <= 0) {
      toast({ title: "Invalid input", description: "Name and cost are required.", variant: "destructive" });
      return;
    }
    
    addTrainingProgram({
      id: uuidv4(),
      name: formState.name,
      category: categoryCodeToLegacy[formState.categoryCode] || 'other',
      categoryCode: formState.categoryCode as TrainingProgram['categoryCode'],
      cost: Number(formState.cost),
      isEmployed: formState.isEmployed,
      isBlack: formState.isBlack,
      gender: (formState.gender || null) as TrainingProgram['gender'],
      race: (formState.race || null) as TrainingProgram['race'],
      isDisabled: formState.isDisabled,
    });
    
    resetForm();
    setIsAddOpen(false);
    toast({ title: "Program Added", description: `${formState.name} has been added to skills spend.` });
  };

  const openEdit = (prog: TrainingProgram) => {
    setEditingId(prog.id);
    setFormState({
      name: prog.name,
      categoryCode: prog.categoryCode || 'D',
      cost: prog.cost,
      isEmployed: prog.isEmployed,
      isBlack: prog.isBlack,
      gender: prog.gender || '',
      race: prog.race || '',
      isDisabled: prog.isDisabled,
    });
    setIsEditOpen(true);
  };

  const handleEdit = () => {
    if (!editingId) return;
    if (!formState.name || formState.cost <= 0) {
      toast({ title: "Invalid input", description: "Name and cost are required.", variant: "destructive" });
      return;
    }

    updateTrainingProgram(editingId, {
      name: formState.name,
      category: categoryCodeToLegacy[formState.categoryCode] || 'other',
      categoryCode: formState.categoryCode as TrainingProgram['categoryCode'],
      cost: Number(formState.cost),
      isEmployed: formState.isEmployed,
      isBlack: formState.isBlack,
      gender: (formState.gender || null) as TrainingProgram['gender'],
      race: (formState.race || null) as TrainingProgram['race'],
      isDisabled: formState.isDisabled,
    });

    setIsEditOpen(false);
    setEditingId(null);
    resetForm();
    toast({ title: "Program Updated", description: `${formState.name} has been updated.` });
  };

  const score = calculateSkillsScore(skills);

  const renderFormFields = () => (
    <div className="grid gap-4 py-4">
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="prog-name" className="text-right">Name</Label>
        <Input
          id="prog-name"
          data-testid="input-program-name"
          value={formState.name}
          onChange={e => setFormState({ ...formState, name: e.target.value })}
          className="col-span-3"
        />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label className="text-right">Category</Label>
        <Select value={formState.categoryCode} onValueChange={(v) => setFormState({ ...formState, categoryCode: v })}>
          <SelectTrigger className="col-span-3" data-testid="select-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="prog-cost" className="text-right">Cost (R)</Label>
        <Input
          id="prog-cost"
          data-testid="input-program-cost"
          type="number"
          value={formState.cost}
          onChange={e => setFormState({ ...formState, cost: Number(e.target.value) })}
          className="col-span-3"
        />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label className="text-right">Gender</Label>
        <Select value={formState.gender} onValueChange={(v) => setFormState({ ...formState, gender: v })}>
          <SelectTrigger className="col-span-3" data-testid="select-gender">
            <SelectValue placeholder="Select gender" />
          </SelectTrigger>
          <SelectContent>
            {GENDER_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label className="text-right">Race</Label>
        <Select value={formState.race} onValueChange={(v) => setFormState({ ...formState, race: v })}>
          <SelectTrigger className="col-span-3" data-testid="select-race">
            <SelectValue placeholder="Select race" />
          </SelectTrigger>
          <SelectContent>
            {RACE_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label className="text-right">Employment</Label>
        <Select value={formState.isEmployed ? "yes" : "no"} onValueChange={(v) => setFormState({ ...formState, isEmployed: v === "yes" })}>
          <SelectTrigger className="col-span-3" data-testid="select-employment">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="yes">Employed</SelectItem>
            <SelectItem value="no">Unemployed</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label className="text-right">Demographic</Label>
        <Select value={formState.isBlack ? "yes" : "no"} onValueChange={(v) => setFormState({ ...formState, isBlack: v === "yes" })}>
          <SelectTrigger className="col-span-3" data-testid="select-demographic">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="yes">Black Individual</SelectItem>
            <SelectItem value="no">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label className="text-right">Disabled</Label>
        <div className="col-span-3 flex items-center gap-2">
          <Checkbox
            id="prog-disabled"
            data-testid="checkbox-disabled"
            checked={formState.isDisabled}
            onCheckedChange={(checked) => setFormState({ ...formState, isDisabled: checked === true })}
          />
          <Label htmlFor="prog-disabled" className="text-sm text-muted-foreground cursor-pointer">
            Person with disability
          </Label>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold">Skills Development</h1>
          <p className="text-muted-foreground mt-1">
            Manage training programs, bursaries, and learnerships.
          </p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="btn-add-training">
              <Plus className="h-4 w-4" />
              Add Program
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Add Training Program</DialogTitle>
              <DialogDescription>Record a new skills development initiative.</DialogDescription>
            </DialogHeader>
            {renderFormFields()}
            <DialogFooter>
              <Button type="submit" onClick={handleAdd} data-testid="btn-save-program">Save Program</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) { setEditingId(null); resetForm(); } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Edit Training Program</DialogTitle>
            <DialogDescription>Update the details of this program.</DialogDescription>
          </DialogHeader>
          {renderFormFields()}
          <DialogFooter>
            <Button type="submit" onClick={handleEdit} data-testid="btn-update-program">Update Program</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="glass-panel" data-testid="card-leviable-amount">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Leviable Amount (Payroll)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-heading">
              R {(leviableAmount / 1000000).toFixed(2)}M
            </div>
            <p className="text-xs text-muted-foreground mt-1">Base for all skills targets</p>
          </CardContent>
        </Card>

        <Card className="glass-panel" data-testid="card-general-spend">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">General Skills Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <div className="text-2xl font-bold font-heading">{formatCurrency(totalSpend)}</div>
              <div className="text-sm text-muted-foreground mb-1">/ {formatCurrency(targetSpend)}</div>
            </div>
            <div className="mt-3 h-2 w-full bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full bg-chart-3 rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, (totalSpend / targetSpend) * 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel" data-testid="card-bursary-spend">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Bursary Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <div className="text-2xl font-bold font-heading">{formatCurrency(bursarySpend)}</div>
              <div className="text-sm text-muted-foreground mb-1">/ {formatCurrency(bursaryTarget)}</div>
            </div>
            <div className="mt-3 h-2 w-full bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full bg-chart-1 rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, (bursarySpend / bursaryTarget) * 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel mt-8 mb-8" data-testid="card-skills-detailed-scorecard">
        <CardHeader>
          <CardTitle>Detailed Scorecard Breakdown</CardTitle>
          <CardDescription>5 sub-line indicators per RCOGP Generic Codes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Indicator</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Target</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Weighting</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {score.subLines.map((sl, idx) => (
                  <tr key={idx} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-muted-foreground">{sl.name}</td>
                    <td className="px-4 py-3 text-right font-mono">{sl.target}</td>
                    <td className="px-4 py-3 text-right font-mono">{sl.weighting.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-primary">{sl.score.toFixed(2)}</td>
                  </tr>
                ))}
                {score.categoryBreakdown.filter(cb => cb.spend > 0).map((cb, idx) => (
                  <tr key={`cat-${idx}`} className="bg-muted/10">
                    <td className="px-4 py-2 pl-8 text-xs text-muted-foreground/70">↳ Cat {cb.code}: {cb.label}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">{cb.cap ? `≤${(cb.cap * 100).toFixed(0)}% cap` : 'No cap'}</td>
                    <td className="px-4 py-2"></td>
                    <td className="px-4 py-2 text-right font-mono text-xs font-semibold">
                      R{cb.recognisedSpend.toLocaleString()}{cb.capApplied ? ' (capped)' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-primary/5 font-bold border-t-2 border-primary/20">
                <tr>
                  <td className="px-4 py-4 text-primary font-medium uppercase tracking-wider" colSpan={2}>Total Skills Development Score</td>
                  <td className="px-4 py-4 text-right font-mono">25.00</td>
                  <td className="px-4 py-4 text-right font-mono text-lg text-primary">{score.total.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Sub-minimum: ≥ 10 pts (40% of 25) — {score.subMinimumMet ? (
              <span className="text-emerald-600 font-bold">PASSED</span>
            ) : (
              <span className="text-destructive font-bold">FAILED</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel" data-testid="card-training-programs">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            Training Programs
          </CardTitle>
          <CardDescription>All recognized skills development initiatives</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">Program Name</th>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">Category</th>
                  <th className="h-10 px-4 text-center font-medium text-muted-foreground">Demographics</th>
                  <th className="h-10 px-4 text-center font-medium text-muted-foreground">Status</th>
                  <th className="h-10 px-4 text-right font-medium text-muted-foreground">Cost</th>
                  <th className="h-10 px-4 text-right font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {trainingPrograms.map((prog, idx) => (
                  <tr key={prog.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors group">
                    <td className="p-4 font-medium" data-testid={`prog-name-${idx}`}>{prog.name}</td>
                    <td className="p-4">
                      <span className={cn("text-xs px-2 py-1 rounded-md border", getCategoryColor(prog.categoryCode || 'D'))}>
                        {formatCategoryLabel(prog)}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex justify-center gap-1 flex-wrap">
                        {prog.gender && (
                          <Badge variant="outline" className="text-[10px]" data-testid={`prog-gender-${idx}`}>{prog.gender}</Badge>
                        )}
                        {prog.race && (
                          <Badge variant="outline" className="text-[10px]" data-testid={`prog-race-${idx}`}>{prog.race}</Badge>
                        )}
                        {prog.isDisabled && (
                          <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800" data-testid={`prog-disabled-${idx}`}>Disabled</Badge>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex justify-center gap-2 flex-wrap">
                        {prog.isBlack && <Badge variant="outline" className="text-[10px]">Black</Badge>}
                        {prog.isEmployed ? (
                          <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800">Employed</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800">Unemployed</Badge>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-right font-mono font-medium" data-testid={`prog-cost-${idx}`}>
                      R {prog.cost.toLocaleString()}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover:opacity-100"
                          style={{ visibility: 'visible' }}
                          onClick={() => openEdit(prog)}
                          data-testid={`btn-edit-program-${idx}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover:opacity-100 text-destructive"
                          style={{ visibility: 'visible' }}
                          onClick={() => removeTrainingProgram(prog.id)}
                          data-testid={`btn-delete-program-${idx}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
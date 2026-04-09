import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
import { Label } from "@toolkit/components/ui/label";
import { Badge } from "@toolkit/components/ui/badge";
import { Progress } from "@toolkit/components/ui/progress";
import { Plus, Trash2, GraduationCap } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@toolkit/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@toolkit/components/ui/dialog";
import { cn, formatRand } from "@toolkit/lib/utils";
import type { SkillsData, TrainingProgram, TrainingCategoryCode } from "@toolkit/lib/types";
import type { CalculatorConfig } from "@shared/schema";
import { calculateSkillsScore } from "@toolkit/lib/calculators/skills";
import { useBbeeStore } from "@toolkit/lib/store";
import { v4 as uuidv4 } from "uuid";

interface SkillsFormProps {
  data: SkillsData;
  onChange: (data: SkillsData) => void;
  npat?: number;
  className?: string;
}

type RaceOption = 'African' | 'Coloured' | 'Indian' | 'White';
type GenderOption = 'Male' | 'Female';
type StatusOption = 'Permanent' | 'Fixed-Term' | 'Unemployed';

// Issue 6: Updated Category F description
const CATEGORY_DESCRIPTIONS: Record<TrainingCategoryCode, string> = {
  A: 'Learnerships / apprenticeships',
  B: 'Skills programs / short courses',
  C: 'Bursaries (employees)',
  D: 'Bursaries (unemployed)',
  E: 'Internships',
  F: 'External Unaccredited Training', // Issue 6: Changed from 'YES Initiative'
  G: 'Informal training',
};

// Issue 6: Added classification fields and expanded cost capture
const emptyForm = {
  programName: '',
  categoryCode: 'B' as TrainingCategoryCode,
  learnerName: '',
  learnerIdNumber: '',
  gender: 'Female' as GenderOption,
  race: 'African' as RaceOption,
  isDisabled: false,
  isForeign: false,
  employmentStatus: 'Permanent' as StatusOption,
  isYesEmployee: false,
  isAbsorbed: false,
  // Issue 6: Added classification fields
  isAbet: false,
  isMandatory: false,
  // Issue 6: Expanded cost capture fields
  courseCost: 0,
  travelCost: 0,
  accommodationCost: 0,
  cateringCost: 0,
  stationeryCost: 0,
  facilityCost: 0,
  salaryCost: 0,
  otherCosts: 0,
  startDate: '',
  endDate: '',
};

export function SkillsForm({ data, onChange, npat, className }: SkillsFormProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const calculatorConfig = useBbeeStore(state => state.calculatorConfig);
  const result = useMemo(() => {
    if (!calculatorConfig) return { total: 0, subMinimumMet: false, learningProgrammes: 0, bursaries: 0, disabledLearning: 0, learnerships: 0, absorption: 0, categoryBreakdown: [], subLines: [], rawStats: {} as any };
    return calculateSkillsScore(data, calculatorConfig);
  }, [data, calculatorConfig]);

  const openAdd = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
    setShowDialog(true);
  };

  // Issue 6: Updated to include all new fields
  const openEdit = (p: TrainingProgram) => {
    setForm({
      programName: p.programName,
      categoryCode: p.categoryCode,
      learnerName: p.learnerName,
      learnerIdNumber: p.learnerIdNumber || '',
      gender: p.gender,
      race: p.race,
      isDisabled: p.isDisabled,
      isForeign: p.isForeign,
      employmentStatus: p.employmentStatus,
      isYesEmployee: p.isYesEmployee,
      isAbsorbed: p.isAbsorbed,
      // Issue 6: Classification fields
      isAbet: p.isAbet || false,
      isMandatory: p.isMandatory || false,
      // Issue 6: Expanded cost fields
      courseCost: p.courseCost,
      travelCost: p.travelCost || 0,
      accommodationCost: p.accommodationCost || 0,
      cateringCost: p.cateringCost || 0,
      stationeryCost: p.stationeryCost || 0,
      facilityCost: p.facilityCost || 0,
      salaryCost: p.salaryCost || 0,
      otherCosts: p.otherCosts || 0,
      startDate: p.startDate || '',
      endDate: p.endDate || '',
    });
    setEditingId(p.id);
    setShowDialog(true);
  };

  // Issue 6: Updated handleSave to include all classification fields and costs
  const handleSave = () => {
    const totalCost = form.courseCost + form.travelCost + form.accommodationCost + 
                      form.cateringCost + form.stationeryCost + form.facilityCost + 
                      form.salaryCost + form.otherCosts;
    
    const program: TrainingProgram = Object.assign(
      {
        id: editingId || uuidv4(),
        programName: form.programName,
        categoryCode: form.categoryCode,
        learnerName: form.learnerName,
        learnerIdNumber: form.learnerIdNumber || undefined,
        gender: form.gender,
        race: form.race,
        isDisabled: form.isDisabled,
        isForeign: form.isForeign,
        employmentStatus: form.employmentStatus,
        isYesEmployee: form.isYesEmployee,
        isAbsorbed: form.isAbsorbed,
        isCompleted: false,
        // Issue 6: All cost fields from form
        courseCost: form.courseCost,
        travelCost: form.travelCost,
        accommodationCost: form.accommodationCost,
        cateringCost: form.cateringCost,
        stationeryCost: form.stationeryCost,
        facilityCost: form.facilityCost,
        salaryCost: form.salaryCost,
        otherCosts: form.otherCosts,
        transactionDate: form.startDate || new Date().toISOString().split('T')[0],
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        // Issue 6: Classification fields from form
        isAbet: form.isAbet,
        isMandatory: form.isMandatory,
        isBursary: form.categoryCode === 'C' || form.categoryCode === 'D',
      },
      {
        get totalCost() { return totalCost; }
      }
    ) as TrainingProgram;

    const updated = editingId
      ? data.trainingPrograms.map(p => p.id === editingId ? program : p)
      : [...data.trainingPrograms, program];

    onChange({ ...data, trainingPrograms: updated });
    setShowDialog(false);
  };

  const handleDelete = (id: string) => {
    onChange({ ...data, trainingPrograms: data.trainingPrograms.filter(p => p.id !== id) });
  };

  // Issue 6: Updated total spend calculation to include all cost fields
  const totalTrainingSpend = data.trainingPrograms.reduce((s, p) => {
    const itemTotal = (p.courseCost || 0) + (p.travelCost || 0) + (p.accommodationCost || 0) + 
                      (p.cateringCost || 0) + (p.stationeryCost || 0) + (p.facilityCost || 0) + 
                      (p.salaryCost || 0) + (p.otherCosts || 0);
    return s + itemTotal;
  }, 0);
  const scorePercent = (result.total / 25) * 100;
  const targetSpend = data.leviableAmount * 0.035;

  return (
    <div className={cn("space-y-5", className)}>
      {/* Score card */}
      <Card className="border-border/80 bg-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium">Skills Score</p>
              <p className="text-xs text-muted-foreground">
                Learning programmes target: {formatRand(targetSpend)} (3.5% of leviable)
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold">{result.total.toFixed(1)}</span>
              <span className="text-sm text-muted-foreground"> / 25</span>
            </div>
          </div>
          <Progress value={scorePercent} className="h-1.5" />
          <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground">Total spend</p>
              <p className="font-medium">{formatRand(totalTrainingSpend)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Leviable amount</p>
              <p className="font-medium">{formatRand(data.leviableAmount)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Sub-minimum</p>
              <p className="font-medium text-muted-foreground">
                {result.subMinimumMet ? 'Met' : 'Not met'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Leviable amount override */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Leviable Amount (SDL payroll)</Label>
          <Input
            type="number"
            value={data.leviableAmount || ''}
            onChange={e => onChange({ ...data, leviableAmount: Number(e.target.value) })}
            placeholder="0"
          />
        </div>
      </div>

      {/* Training Programs */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">
            Training Programs
            <span className="ml-2 text-muted-foreground font-normal">
              ({data.trainingPrograms.length})
            </span>
          </h3>
          <Button size="sm" variant="outline" onClick={openAdd} className="gap-1.5 h-8 text-xs">
            <Plus className="h-3.5 w-3.5" />
            Add Program
          </Button>
        </div>

        {data.trainingPrograms.length === 0 ? (
          <div className="border border-dashed rounded-lg py-10 text-center">
            <GraduationCap className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No training programs added</p>
            <p className="text-xs text-muted-foreground mt-1">Add training spend to calculate skills score</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Learner</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Category</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Race/Gender</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Cost</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.trainingPrograms.map((p) => (
                  <tr
                    key={p.id}
                    className="hover:bg-muted/20 cursor-pointer transition-colors"
                    onClick={() => openEdit(p)}
                  >
                    <td className="px-3 py-2">
                      <p className="font-medium text-xs">{p.learnerName}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[140px]">{p.programName}</p>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-xs">
                        Cat {p.categoryCode}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {p.race} · {p.gender}
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-medium">
                      {formatRand(p.courseCost)}
                    </td>
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(p.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30 border-t">
                  <td colSpan={3} className="px-3 py-2 text-xs font-medium text-muted-foreground">Total</td>
                  <td className="px-3 py-2 text-right text-xs font-bold">{formatRand(totalTrainingSpend)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Training Program' : 'Add Training Program'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Learner Name</Label>
                <Input value={form.learnerName} onChange={e => setForm(p => ({ ...p, learnerName: e.target.value }))} placeholder="Full name" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">ID Number</Label>
                <Input value={form.learnerIdNumber} onChange={e => setForm(p => ({ ...p, learnerIdNumber: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Program Name</Label>
              <Input value={form.programName} onChange={e => setForm(p => ({ ...p, programName: e.target.value }))} placeholder="e.g. NQF Level 4 Business Admin" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Training Category</Label>
                <Select value={form.categoryCode} onValueChange={(v: TrainingCategoryCode) => setForm(p => ({ ...p, categoryCode: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CATEGORY_DESCRIPTIONS) as TrainingCategoryCode[]).map(c => (
                      <SelectItem key={c} value={c}>Cat {c} – {CATEGORY_DESCRIPTIONS[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Employment Status</Label>
                <Select value={form.employmentStatus} onValueChange={(v: StatusOption) => setForm(p => ({ ...p, employmentStatus: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['Permanent', 'Fixed-Term', 'Unemployed'] as StatusOption[]).map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Race</Label>
                <Select value={form.race} onValueChange={(v: RaceOption) => setForm(p => ({ ...p, race: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['African', 'Coloured', 'Indian', 'White'] as RaceOption[]).map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Gender</Label>
                <Select value={form.gender} onValueChange={(v: GenderOption) => setForm(p => ({ ...p, gender: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Male">Male</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Issue 6: Classification checkboxes */}
            <div className="grid grid-cols-3 gap-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isAbet}
                  onChange={e => setForm(p => ({ ...p, isAbet: e.target.checked }))}
                  className="h-4 w-4"
                />
                <Label className="text-xs">ABET</Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isMandatory}
                  onChange={e => setForm(p => ({ ...p, isMandatory: e.target.checked }))}
                  className="h-4 w-4"
                />
                <Label className="text-xs">Mandatory</Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isDisabled}
                  onChange={e => setForm(p => ({ ...p, isDisabled: e.target.checked }))}
                  className="h-4 w-4"
                />
                <Label className="text-xs">Disabled</Label>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                checked={form.isForeign}
                onChange={e => setForm(p => ({ ...p, isForeign: e.target.checked }))}
                className="h-4 w-4"
              />
              <Label className="text-xs">Foreign National (excluded from BEE calculations)</Label>
            </div>

            {/* Issue 6: Expanded cost capture */}
            <div className="border-t pt-4 mt-2">
              <Label className="text-xs font-semibold mb-2 block">Cost Breakdown</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Course/Tuition (R)</Label>
                  <Input type="number" value={form.courseCost || ''} onChange={e => setForm(p => ({ ...p, courseCost: Number(e.target.value) }))} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Travel (R)</Label>
                  <Input type="number" value={form.travelCost || ''} onChange={e => setForm(p => ({ ...p, travelCost: Number(e.target.value) }))} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Accommodation (R)</Label>
                  <Input type="number" value={form.accommodationCost || ''} onChange={e => setForm(p => ({ ...p, accommodationCost: Number(e.target.value) }))} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Catering (R)</Label>
                  <Input type="number" value={form.cateringCost || ''} onChange={e => setForm(p => ({ ...p, cateringCost: Number(e.target.value) }))} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Stationery (R)</Label>
                  <Input type="number" value={form.stationeryCost || ''} onChange={e => setForm(p => ({ ...p, stationeryCost: Number(e.target.value) }))} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Facility/Venue (R)</Label>
                  <Input type="number" value={form.facilityCost || ''} onChange={e => setForm(p => ({ ...p, facilityCost: Number(e.target.value) }))} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Salary/Stipend (R)</Label>
                  <Input type="number" value={form.salaryCost || ''} onChange={e => setForm(p => ({ ...p, salaryCost: Number(e.target.value) }))} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Other Costs (R)</Label>
                  <Input type="number" value={form.otherCosts || ''} onChange={e => setForm(p => ({ ...p, otherCosts: Number(e.target.value) }))} placeholder="0" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t">
              <div className="space-y-1.5">
                <Label className="text-xs">Start Date</Label>
                <Input type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">End Date</Label>
                <Input type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.learnerName || !form.programName || form.courseCost <= 0}>
              {editingId ? 'Save Changes' : 'Add Program'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

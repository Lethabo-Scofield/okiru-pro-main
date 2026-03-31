import React, { useState, useMemo } from 'react';
import { Card, CardContent } from "@toolkit/components/ui/card";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
import { Label } from "@toolkit/components/ui/label";
import { Badge } from "@toolkit/components/ui/badge";
import { Checkbox } from "@toolkit/components/ui/checkbox";
import { Progress } from "@toolkit/components/ui/progress";
import { Plus, Trash2, Users } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@toolkit/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@toolkit/components/ui/dialog";
import { cn } from "@toolkit/lib/utils";
import type { YESData, YESCandidate } from "@toolkit/lib/types";
import { calculateYESScore } from "@toolkit/lib/calculators/yes";
import { v4 as uuidv4 } from "uuid";

interface YESFormProps {
  data: YESData;
  onChange: (data: YESData) => void;
  totalEmployees?: number;
  className?: string;
}

type RaceOption = 'African' | 'Coloured' | 'Indian' | 'White';
type GenderOption = 'Male' | 'Female';

const emptyCandidate = {
  name: '',
  idNumber: '',
  race: 'African' as RaceOption,
  gender: 'Female' as GenderOption,
  isDisabled: false,
  isBlack: true,
  startDate: '',
  endDate: '',
  isAbsorbed: false,
  absorptionDate: '',
  cost: 0,
};

export function YESForm({ data, onChange, totalEmployees, className }: YESFormProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyCandidate });

  const result = useMemo(() => calculateYESScore(data), [data]);
  const blackYouthCount = data.candidates.filter(c => c.isBlack).length;
  const absorbedCount = data.candidates.filter(c => c.isAbsorbed).length;

  const headcountTarget = totalEmployees
    ? totalEmployees < 500
      ? Math.ceil(totalEmployees * 0.025)
      : totalEmployees <= 1000
        ? Math.ceil(totalEmployees * 0.015)
        : Math.ceil(totalEmployees * 0.01)
    : data.yesHeadcountTarget;

  const openAdd = () => {
    setForm({ ...emptyCandidate });
    setEditingId(null);
    setShowDialog(true);
  };

  const openEdit = (c: YESCandidate) => {
    setForm({
      name: c.name,
      idNumber: c.idNumber || '',
      race: c.race,
      gender: c.gender,
      isDisabled: c.isDisabled,
      isBlack: c.isBlack,
      startDate: c.startDate || '',
      endDate: c.endDate || '',
      isAbsorbed: c.isAbsorbed,
      absorptionDate: c.absorptionDate || '',
      cost: c.cost,
    });
    setEditingId(c.id);
    setShowDialog(true);
  };

  const handleSave = () => {
    const candidate: YESCandidate = {
      id: editingId || uuidv4(),
      name: form.name,
      idNumber: form.idNumber || undefined,
      race: form.race,
      gender: form.gender,
      isDisabled: form.isDisabled,
      isBlack: ['African', 'Coloured', 'Indian'].includes(form.race),
      startDate: form.startDate,
      endDate: form.endDate || undefined,
      isAbsorbed: form.isAbsorbed,
      absorptionDate: form.absorptionDate || undefined,
      cost: form.cost,
    };

    const updated = editingId
      ? data.candidates.map(c => c.id === editingId ? candidate : c)
      : [...data.candidates, candidate];

    const newBlackCount = updated.filter(c => c.isBlack).length;
    const newAbsorbedCount = updated.filter(c => c.isAbsorbed).length;

    onChange({
      ...data,
      candidates: updated,
      yesYouthEnrolled: updated.length,
      yesBlackYouthCount: newBlackCount,
      yesBlackYouthPercentage: updated.length > 0 ? newBlackCount / updated.length : 0,
      yesAbsorbedCount: newAbsorbedCount,
      yesAbsorptionRate: updated.length > 0 ? newAbsorbedCount / updated.length : 0,
      totalYesCost: updated.reduce((s, c) => s + c.cost, 0),
      yesCostPerCandidate: updated.length > 0 ? updated.reduce((s, c) => s + c.cost, 0) / updated.length : 0,
    });
    setShowDialog(false);
  };

  const handleDelete = (id: string) => {
    const updated = data.candidates.filter(c => c.id !== id);
    const newBlackCount = updated.filter(c => c.isBlack).length;
    const newAbsorbedCount = updated.filter(c => c.isAbsorbed).length;
    onChange({
      ...data,
      candidates: updated,
      yesYouthEnrolled: updated.length,
      yesBlackYouthCount: newBlackCount,
      yesBlackYouthPercentage: updated.length > 0 ? newBlackCount / updated.length : 0,
      yesAbsorbedCount: newAbsorbedCount,
      yesAbsorptionRate: updated.length > 0 ? newAbsorbedCount / updated.length : 0,
    });
  };

  const tierLabel = result.yesTierAchieved === 'None' ? '—' : result.yesTierAchieved;
  const targetMet = data.candidates.length >= headcountTarget;

  return (
    <div className={cn("space-y-5", className)}>
      {/* Score card */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm font-medium">YES Initiative</p>
              <p className="text-xs text-muted-foreground">
                Target: {headcountTarget} youth · {data.candidates.length} enrolled
              </p>
            </div>
            <div className="text-right">
              <Badge variant={result.yesBeeLevelIncrease > 0 ? "default" : "outline"}>
                {result.yesBeeLevelIncrease > 0 ? `+${result.yesBeeLevelIncrease} level` : 'No uplift'}
              </Badge>
              <p className="text-xs text-muted-foreground mt-1">Tier: {tierLabel}</p>
            </div>
          </div>
          <Progress value={targetMet ? 100 : (data.candidates.length / headcountTarget) * 100} className="h-1.5" />
          <div className="mt-3 grid grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground">Enrolled</p>
              <p className="font-medium">{data.candidates.length}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Black youth</p>
              <p className="font-medium">{blackYouthCount} ({data.yesYouthEnrolled > 0 ? Math.round(blackYouthCount / data.yesYouthEnrolled * 100) : 0}%)</p>
            </div>
            <div>
              <p className="text-muted-foreground">Absorbed</p>
              <p className="font-medium">{absorbedCount}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Qualifies</p>
              <p className={cn("font-medium", result.qualifiesForLevelUplift ? "text-green-600" : "")}>
                {result.qualifiesForLevelUplift ? 'Yes' : 'No'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Candidates */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">
            Youth Candidates
            <span className="ml-2 text-muted-foreground font-normal">({data.candidates.length} / {headcountTarget} target)</span>
          </h3>
          <Button size="sm" variant="outline" onClick={openAdd} className="gap-1.5 h-8 text-xs">
            <Plus className="h-3.5 w-3.5" />
            Add Candidate
          </Button>
        </div>

        {data.candidates.length === 0 ? (
          <div className="border border-dashed rounded-lg py-10 text-center">
            <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No YES candidates added</p>
            <p className="text-xs text-muted-foreground mt-1">Need {headcountTarget} youth to qualify for level uplift</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Demographics</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Period</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.candidates.map(c => (
                  <tr key={c.id} className="hover:bg-muted/20 cursor-pointer" onClick={() => openEdit(c)}>
                    <td className="px-3 py-2 text-xs font-medium">{c.name}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{c.race} · {c.gender}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {c.startDate} {c.endDate && `→ ${c.endDate}`}
                    </td>
                    <td className="px-3 py-2">
                      {c.isAbsorbed
                        ? <Badge variant="default" className="text-[10px]">Absorbed</Badge>
                        : <Badge variant="outline" className="text-[10px]">Active</Badge>
                      }
                    </td>
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(c.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit' : 'Add'} YES Candidate</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Full Name</Label>
                <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Full name" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">ID Number</Label>
                <Input value={form.idNumber} onChange={e => setForm(p => ({ ...p, idNumber: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Race</Label>
                <Select value={form.race} onValueChange={(v: RaceOption) => setForm(p => ({ ...p, race: v, isBlack: ['African', 'Coloured', 'Indian'].includes(v) }))}>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Start Date</Label>
                <Input type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">End Date</Label>
                <Input type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Programme Cost (R)</Label>
              <Input type="number" value={form.cost || ''} onChange={e => setForm(p => ({ ...p, cost: Number(e.target.value) }))} placeholder="0" />
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox checked={form.isAbsorbed} onCheckedChange={v => setForm(p => ({ ...p, isAbsorbed: !!v }))} />
                Absorbed after YES programme
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox checked={form.isDisabled} onCheckedChange={v => setForm(p => ({ ...p, isDisabled: !!v }))} />
                Person with disability
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.name || !form.startDate}>
              {editingId ? 'Save' : 'Add Candidate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

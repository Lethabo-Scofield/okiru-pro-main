import React, { useState, useMemo } from 'react';
import { Card, CardContent } from "@toolkit/components/ui/card";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
import { Label } from "@toolkit/components/ui/label";
import { Progress } from "@toolkit/components/ui/progress";
import { Plus, Trash2, Heart } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@toolkit/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@toolkit/components/ui/dialog";
import { cn, formatRand } from "@toolkit/lib/utils";
import type { SEDData, Contribution, SEDContributionType } from "@toolkit/lib/types";
import { calculateSedScore } from "@toolkit/lib/calculators/esd-sed";
import { v4 as uuidv4 } from "uuid";

interface SEDFormProps {
  data: SEDData;
  onChange: (data: SEDData) => void;
  npat?: number;
  className?: string;
}

const SED_TYPES: { value: SEDContributionType; label: string }[] = [
  { value: 'grant',                           label: 'Grant / donation' },
  { value: 'direct_cost',                     label: 'Direct cost' },
  { value: 'discounts',                        label: 'Discounts' },
  { value: 'overhead_costs',                  label: 'Overhead costs' },
  { value: 'professional_services_free',       label: 'Professional services (free)' },
  { value: 'professional_services_discounted', label: 'Professional services (discounted)' },
  { value: 'employee_time',                    label: 'Employee time' },
];

const emptyForm = {
  beneficiary: '',
  description: '',
  type: 'grant' as SEDContributionType,
  amount: 0,
  blackBenefitPercent: 100,
};

export function SEDForm({ data, onChange, npat = 0, className }: SEDFormProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const result = useMemo(() => calculateSedScore(data, npat), [data, npat]);
  const totalSED = data.contributions.reduce((s, c) => s + c.amount, 0);
  const scorePercent = (result.total / 5) * 100;
  const target = npat * 0.01;

  const openAdd = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
    setShowDialog(true);
  };

  const openEdit = (c: Contribution) => {
    setForm({
      beneficiary: c.beneficiary,
      description: c.description || '',
      type: c.type as SEDContributionType,
      amount: c.amount,
      blackBenefitPercent: c.blackBenefitPercent ?? 100,
    });
    setEditingId(c.id);
    setShowDialog(true);
  };

  const handleSave = () => {
    const contrib: Contribution = {
      id: editingId || uuidv4(),
      beneficiary: form.beneficiary,
      description: form.description || undefined,
      type: form.type,
      amount: form.amount,
      category: 'socio_economic',
      blackBenefitPercent: form.blackBenefitPercent,
    };
    const updated = editingId
      ? data.contributions.map(c => c.id === editingId ? contrib : c)
      : [...data.contributions, contrib];
    onChange({ ...data, contributions: updated });
    setShowDialog(false);
  };

  const handleDelete = (id: string) => {
    onChange({ ...data, contributions: data.contributions.filter(c => c.id !== id) });
  };

  return (
    <div className={cn("space-y-5", className)}>
      {/* Score card */}
      <Card className="border-border/80 bg-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium">SED Score</p>
              <p className="text-xs text-muted-foreground">
                Target: {formatRand(target)} (1% of NPAT)
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold">{result.total.toFixed(1)}</span>
              <span className="text-sm text-muted-foreground"> / 5</span>
            </div>
          </div>
          <Progress value={scorePercent} className="h-1.5" />
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground">Total contributions</p>
              <p className="font-medium">{formatRand(totalSED)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">NPAT reference</p>
              <p className="font-medium">{formatRand(npat)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contributions list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">
            SED Contributions
            <span className="ml-2 text-muted-foreground font-normal">({data.contributions.length})</span>
          </h3>
          <Button size="sm" variant="outline" onClick={openAdd} className="gap-1.5 h-8 text-xs">
            <Plus className="h-3.5 w-3.5" />
            Add Contribution
          </Button>
        </div>

        {data.contributions.length === 0 ? (
          <div className="border border-dashed rounded-lg py-10 text-center">
            <Heart className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No SED contributions added</p>
            <p className="text-xs text-muted-foreground mt-1">Add contributions to calculate SED score</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Beneficiary</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Type</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Black %</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Amount</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.contributions.map(c => (
                  <tr key={c.id} className="hover:bg-muted/20 cursor-pointer" onClick={() => openEdit(c)}>
                    <td className="px-3 py-2">
                      <p className="text-xs font-medium">{c.beneficiary}</p>
                      {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {SED_TYPES.find(t => t.value === c.type)?.label ?? c.type}
                    </td>
                    <td className="px-3 py-2 text-xs">{c.blackBenefitPercent ?? 100}%</td>
                    <td className="px-3 py-2 text-right text-xs font-medium">{formatRand(c.amount)}</td>
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(c.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30 border-t">
                  <td colSpan={3} className="px-3 py-2 text-xs text-muted-foreground">Total</td>
                  <td className="px-3 py-2 text-right text-xs font-bold">{formatRand(totalSED)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit' : 'Add'} SED Contribution</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Beneficiary</Label>
              <Input value={form.beneficiary} onChange={e => setForm(p => ({ ...p, beneficiary: e.target.value }))} placeholder="Organisation or community name" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description (optional)</Label>
              <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Brief description" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Contribution Type</Label>
                <Select value={form.type} onValueChange={(v: SEDContributionType) => setForm(p => ({ ...p, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SED_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Amount (R)</Label>
                <Input type="number" value={form.amount || ''} onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))} placeholder="0" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Black Beneficiary % (for weighting)</Label>
              <Input type="number" min="0" max="100" value={form.blackBenefitPercent} onChange={e => setForm(p => ({ ...p, blackBenefitPercent: Number(e.target.value) }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.beneficiary || form.amount <= 0}>
              {editingId ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

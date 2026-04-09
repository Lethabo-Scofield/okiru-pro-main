import React, { useState, useMemo } from 'react';
import { Card, CardContent } from "@toolkit/components/ui/card";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
import { Label } from "@toolkit/components/ui/label";
import { Badge } from "@toolkit/components/ui/badge";
import { Progress } from "@toolkit/components/ui/progress";
import { Checkbox } from "@toolkit/components/ui/checkbox";
import { Plus, Trash2, Handshake } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@toolkit/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@toolkit/components/ui/dialog";
import { cn, formatRand } from "@toolkit/lib/utils";
import type { ESDData, Contribution, ESDContributionType } from "@toolkit/lib/types";
import type { CalculatorConfig } from "@shared/schema";
import { calculateEsdScore } from "@toolkit/lib/calculators/esd-sed";
import { useBbeeStore } from "@toolkit/lib/store";
import { v4 as uuidv4 } from "uuid";

interface ESDFormProps {
  data: ESDData;
  onChange: (data: ESDData) => void;
  npat?: number;
  className?: string;
}

const ESD_TYPES: { value: ESDContributionType; label: string }[] = [
  { value: 'equity_investment',           label: 'Equity investment' },
  { value: 'loan',                         label: 'Loan' },
  { value: 'interest_free_loan',           label: 'Interest-free loan' },
  { value: 'lower_interest_loan',          label: 'Lower interest loan' },
  { value: 'guarantee',                    label: 'Guarantee' },
  { value: 'collateral',                   label: 'Collateral' },
  { value: 'credit_facility',              label: 'Credit facility' },
  { value: 'direct_cost',                  label: 'Direct cost' },
  { value: 'overhead_costs',              label: 'Overhead costs' },
  { value: 'professional_services_free',   label: 'Professional services (free)' },
  { value: 'professional_services_discounted', label: 'Professional services (discounted)' },
  { value: 'employee_secondment',          label: 'Employee secondment' },
  { value: 'employee_mentorship',          label: 'Employee mentorship' },
  { value: 'non_core_business_transfer',   label: 'Non-core business transfer' },
];

type ESDCategory = 'supplier_development' | 'enterprise_development';

const emptyForm: {
  beneficiary: string;
  description: string;
  type: ESDContributionType;
  amount: number;
  category: ESDCategory;
  blackBenefitPercent: number;
} = {
  beneficiary: '',
  description: '',
  type: 'direct_cost',
  amount: 0,
  category: 'supplier_development',
  blackBenefitPercent: 100,
};

export function ESDForm({ data, onChange, npat = 0, className }: ESDFormProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof emptyForm>({ ...emptyForm });

  const calculatorConfig = useBbeeStore(state => state.calculatorConfig);
  const result = useMemo(() => {
    if (!calculatorConfig) return { total: 0, sdTotal: 0, edTotal: 0, supplierDev: 0, enterpriseDev: 0, graduationBonus: 0, jobsCreatedBonus: 0, sdSubMinimumMet: false, edSubMinimumMet: false, subMinimumMet: false, sdSpend: 0, edSpend: 0, sdTarget: 0, edTarget: 0, sdSubLines: [], edSubLines: [], subLines: [] };
    return calculateEsdScore(data, npat, calculatorConfig);
  }, [data, npat, calculatorConfig]);
  const totalESD = data.contributions.reduce((s, c) => s + c.amount, 0);
  const esdMaxDisplay = 17; // SD 10 + ED 7 (RCOGP Generic)
  const scorePercent = (result.total / esdMaxDisplay) * 100;

  const sdContribs = data.contributions.filter(c => c.category === 'supplier_development');
  const edContribs = data.contributions.filter(c => c.category === 'enterprise_development');

  const openAdd = (category: ESDCategory) => {
    setForm({ ...emptyForm, category });
    setEditingId(null);
    setShowDialog(true);
  };

  const openEdit = (c: Contribution) => {
    setForm({
      beneficiary: c.beneficiary,
      description: c.description || '',
      type: c.type as ESDContributionType,
      amount: c.amount,
      category: (c.category === 'supplier_development' || c.category === 'enterprise_development')
        ? c.category
        : 'supplier_development',
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
      category: form.category,
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

  const renderTable = (
    contribs: Contribution[],
    category: ESDCategory,
    title: string,
    maxPoints: number
  ) => (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">{title} <span className="text-muted-foreground font-normal">· max {maxPoints} pts</span></h3>
        <Button size="sm" variant="outline" onClick={() => openAdd(category)} className="gap-1.5 h-7 text-xs">
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>
      {contribs.length === 0 ? (
        <div className="border border-dashed rounded-lg py-6 text-center mb-4">
          <p className="text-xs text-muted-foreground">No contributions added</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Beneficiary</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Type</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Amount</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {contribs.map(c => (
                <tr key={c.id} className="hover:bg-muted/20 cursor-pointer" onClick={() => openEdit(c)}>
                  <td className="px-3 py-2">
                    <p className="text-xs font-medium">{c.beneficiary}</p>
                    {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {ESD_TYPES.find(t => t.value === c.type)?.label ?? c.type}
                  </td>
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
                <td colSpan={2} className="px-3 py-2 text-xs text-muted-foreground">Total</td>
                <td className="px-3 py-2 text-right text-xs font-bold">{formatRand(contribs.reduce((s, c) => s + c.amount, 0))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <div className={cn("space-y-5", className)}>
      {/* Score card */}
      <Card className="border-border/80 bg-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium">Enterprise & Supplier Development</p>
              <p className="text-xs text-muted-foreground">NPAT: {formatRand(npat)} · SD max 10 + ED max 7</p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold">{result.total.toFixed(1)}</span>
              <span className="text-sm text-muted-foreground"> / {esdMaxDisplay}</span>
            </div>
          </div>
          <Progress value={scorePercent} className="h-1.5" />
          <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground">Supplier Dev</p>
              <p className="font-medium">{formatRand(sdContribs.reduce((s, c) => s + c.amount, 0))}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Enterprise Dev</p>
              <p className="font-medium">{formatRand(edContribs.reduce((s, c) => s + c.amount, 0))}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Total contributions</p>
              <p className="font-medium">{formatRand(totalESD)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bonuses */}
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={data.graduationBonus} onCheckedChange={v => onChange({ ...data, graduationBonus: !!v })} />
          <span className="text-sm">Graduation bonus</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={data.jobsCreatedBonus} onCheckedChange={v => onChange({ ...data, jobsCreatedBonus: !!v })} />
          <span className="text-sm">Jobs created bonus</span>
        </label>
      </div>

      {renderTable(sdContribs, 'supplier_development', 'Supplier Development', 10)}
      {renderTable(edContribs, 'enterprise_development', 'Enterprise Development', 5)}

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit' : 'Add'} {form.category === 'supplier_development' ? 'Supplier Development' : 'Enterprise Development'} Contribution
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Beneficiary</Label>
              <Input value={form.beneficiary} onChange={e => setForm(p => ({ ...p, beneficiary: e.target.value }))} placeholder="Company or entity name" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description (optional)</Label>
              <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Brief description" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Contribution Type</Label>
                <Select value={form.type} onValueChange={(v: ESDContributionType) => setForm(p => ({ ...p, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ESD_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Amount (R)</Label>
                <Input type="number" value={form.amount || ''} onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))} placeholder="0" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Black Beneficiary %</Label>
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

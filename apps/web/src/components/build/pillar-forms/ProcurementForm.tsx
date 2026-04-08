import React, { useState, useMemo } from 'react';
import { Card, CardContent } from "@toolkit/components/ui/card";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
import { Label } from "@toolkit/components/ui/label";
import { Badge } from "@toolkit/components/ui/badge";
import { Progress } from "@toolkit/components/ui/progress";
import { Checkbox } from "@toolkit/components/ui/checkbox";
import { Plus, Trash2, ShoppingCart } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@toolkit/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@toolkit/components/ui/dialog";
import { cn, formatRand } from "@toolkit/lib/utils";
import type { ProcurementData, Supplier } from "@toolkit/lib/types";
import type { CalculatorConfig } from "@toolkit/shared/schema";
import { calculateProcurementScore } from "@toolkit/lib/calculators/procurement";
import { useBbeeStore } from "@toolkit/lib/store";
import { v4 as uuidv4 } from "uuid";

interface ProcurementFormProps {
  data: ProcurementData;
  onChange: (data: ProcurementData) => void;
  className?: string;
}

// Issue 3: Removed graduation bonus, added isForeignSupplier
const emptySupplier = {
  name: '',
  vatNumber: '',
  beeLevel: 4 as Supplier['beeLevel'],
  blackOwnership: 0,
  blackWomenOwnership: 0,
  youthOwnership: 0,
  disabledOwnership: 0,
  enterpriseType: 'generic' as Supplier['enterpriseType'],
  isEmpoweringSupplier: false,
  isSupplierDevRecipient: false,
  hasThreeYearContract: false,
  isForeignSupplier: false, // Issue 3: Added
  spend: 0,
};

export function ProcurementForm({ data, onChange, className }: ProcurementFormProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptySupplier });

  const calculatorConfig = useBbeeStore(state => state.calculatorConfig);
  const result = useMemo(() => {
    if (!calculatorConfig) return { total: 0, subMinimumMet: false, subLines: [], recognisedSpend: 0, target: 0, base: 0, empoweringSuppliers: 0, qseSuppliers: 0, emeSuppliers: 0, blackOwned51: 0, blackFemaleOwned30: 0, designatedGroup: 0, rawStats: {} as any };
    return calculateProcurementScore(data, calculatorConfig);
  }, [data, calculatorConfig]);

  const totalSpend = data.suppliers.reduce((s, sup) => s + sup.spend, 0);
  const scorePercent = (result.total / 29) * 100;

  const openAdd = () => {
    setForm({ ...emptySupplier });
    setEditingId(null);
    setShowDialog(true);
  };

  const openEdit = (s: Supplier) => {
    setForm({
      name: s.name,
      vatNumber: s.vatNumber || '',
      beeLevel: s.beeLevel,
      blackOwnership: s.blackOwnership,
      blackWomenOwnership: s.blackWomenOwnership,
      youthOwnership: s.youthOwnership,
      disabledOwnership: s.disabledOwnership,
      enterpriseType: s.enterpriseType,
      isEmpoweringSupplier: s.isEmpoweringSupplier,
      isSupplierDevRecipient: s.isSupplierDevRecipient,
      hasThreeYearContract: s.hasThreeYearContract,
      isForeignSupplier: s.isForeignSupplier || false, // Issue 3: Added
      spend: s.spend,
    });
    setEditingId(s.id);
    setShowDialog(true);
  };

  // Issue 3: Added isForeignSupplier to saved supplier
  const handleSave = () => {
    const supplier: Supplier = {
      id: editingId || uuidv4(),
      name: form.name,
      vatNumber: form.vatNumber || undefined,
      beeLevel: form.beeLevel,
      blackOwnership: form.blackOwnership,
      blackWomenOwnership: form.blackWomenOwnership,
      youthOwnership: form.youthOwnership,
      disabledOwnership: form.disabledOwnership,
      enterpriseType: form.enterpriseType,
      isEmpoweringSupplier: form.isEmpoweringSupplier,
      isSupplierDevRecipient: form.isSupplierDevRecipient,
      hasThreeYearContract: form.hasThreeYearContract,
      isForeignSupplier: form.isForeignSupplier, // Issue 3: Added
      spend: form.spend,
    };
    const updated = editingId
      ? data.suppliers.map(s => s.id === editingId ? supplier : s)
      : [...data.suppliers, supplier];
    onChange({ ...data, suppliers: updated });
    setShowDialog(false);
  };

  const handleDelete = (id: string) => {
    onChange({ ...data, suppliers: data.suppliers.filter(s => s.id !== id) });
  };

  return (
    <div className={cn("space-y-5", className)}>
      {/* Score summary */}
      <Card className="border-border/80 bg-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium">Procurement Score</p>
              <p className="text-xs text-muted-foreground">TMPS: {formatRand(data.tmps)}</p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold">{result.total.toFixed(1)}</span>
              <span className="text-sm text-muted-foreground"> / 29</span>
            </div>
          </div>
          <Progress value={scorePercent} className="h-1.5" />
          <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground">Total spend</p>
              <p className="font-medium">{formatRand(totalSpend)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Recognised spend</p>
              <p className="font-medium">{formatRand(result.recognisedSpend ?? 0)}</p>
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

      {/* TMPS + bonuses */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Total Measured Procurement Spend (TMPS)</Label>
          <Input
            type="number"
            value={data.tmps || ''}
            onChange={e => onChange({ ...data, tmps: Number(e.target.value) })}
            placeholder="0"
          />
        </div>
      </div>

      {/* Issue 3: Removed graduation and jobs created bonus checkboxes (ED only bonuses) */}

      {/* Suppliers */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">
            Suppliers
            <span className="ml-2 text-muted-foreground font-normal">({data.suppliers.length})</span>
          </h3>
          <Button size="sm" variant="outline" onClick={openAdd} className="gap-1.5 h-8 text-xs">
            <Plus className="h-3.5 w-3.5" />
            Add Supplier
          </Button>
        </div>

        {data.suppliers.length === 0 ? (
          <div className="border border-dashed rounded-lg py-10 text-center">
            <ShoppingCart className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No suppliers added</p>
            <p className="text-xs text-muted-foreground mt-1">Add suppliers to calculate procurement score</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Supplier</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">BEE Level</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Size</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Black %</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Spend</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.suppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/20 cursor-pointer transition-colors" onClick={() => openEdit(s)}>
                    <td className="px-3 py-2">
                      <p className="font-medium text-xs">{s.name}</p>
                      {s.isEmpoweringSupplier && <Badge variant="outline" className="text-[10px] mt-0.5">Empowering</Badge>}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <Badge variant="outline">L{s.beeLevel}</Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground uppercase">{s.enterpriseType}</td>
                    <td className="px-3 py-2 text-xs">{(s.blackOwnership * 100).toFixed(0)}%</td>
                    <td className="px-3 py-2 text-right text-xs font-medium">{formatRand(s.spend)}</td>
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(s.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30 border-t">
                  <td colSpan={4} className="px-3 py-2 text-xs font-medium text-muted-foreground">Total</td>
                  <td className="px-3 py-2 text-right text-xs font-bold">{formatRand(totalSpend)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Supplier' : 'Add Supplier'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Supplier Name</Label>
                <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Company name" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">VAT Number</Label>
                <Input value={form.vatNumber} onChange={e => setForm(p => ({ ...p, vatNumber: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">BEE Level</Label>
                <Select value={String(form.beeLevel)} onValueChange={(v) => setForm(p => ({ ...p, beeLevel: Number(v) as Supplier['beeLevel'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4,5,6,7,8,0].map(l => <SelectItem key={l} value={String(l)}>{l === 0 ? 'Non-compliant' : `Level ${l}`}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Enterprise Type</Label>
                <Select value={form.enterpriseType} onValueChange={(v: Supplier['enterpriseType']) => setForm(p => ({ ...p, enterpriseType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eme">EME</SelectItem>
                    <SelectItem value="qse">QSE</SelectItem>
                    <SelectItem value="generic">Generic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Spend (R)</Label>
                <Input type="number" value={form.spend || ''} onChange={e => setForm(p => ({ ...p, spend: Number(e.target.value) }))} placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Black Ownership %</Label>
                <Input type="number" min="0" max="100" value={(form.blackOwnership * 100).toFixed(0)} onChange={e => setForm(p => ({ ...p, blackOwnership: Number(e.target.value) / 100 }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Black Women Ownership %</Label>
                <Input type="number" min="0" max="100" value={(form.blackWomenOwnership * 100).toFixed(0)} onChange={e => setForm(p => ({ ...p, blackWomenOwnership: Number(e.target.value) / 100 }))} />
              </div>
            </div>
            {/* Issue 3: Replaced graduation bonus with foreign supplier checkbox */}
            <div className="flex flex-col gap-2 pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox checked={form.isEmpoweringSupplier} onCheckedChange={v => setForm(p => ({ ...p, isEmpoweringSupplier: !!v }))} />
                Empowering Supplier
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox checked={form.isSupplierDevRecipient} onCheckedChange={v => setForm(p => ({ ...p, isSupplierDevRecipient: !!v }))} />
                ESD Supplier Development recipient
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox checked={form.isForeignSupplier} onCheckedChange={v => setForm(p => ({ ...p, isForeignSupplier: !!v }))} />
                Foreign Supplier (excluded from Empowering Supplier recognition)
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.name || form.spend <= 0}>
              {editingId ? 'Save' : 'Add Supplier'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

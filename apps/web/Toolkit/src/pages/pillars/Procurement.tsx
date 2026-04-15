import { useState } from "react";
import { useBbeeStore } from "@toolkit/lib/store";
import { calculateProcurementScore } from "@toolkit/lib/calculators/procurement";
import { round2 } from "@toolkit/lib/calculators/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Badge } from "@toolkit/components/ui/badge";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
import { Label } from "@toolkit/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@toolkit/components/ui/select";
import { Switch } from "@toolkit/components/ui/switch";
import { Plus, ShoppingCart, Trash2, Pencil } from "lucide-react";
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
import type { Supplier } from "@toolkit/lib/types";

// Issue 3: Added isForeignSupplier field
const emptySupplierForm = {
  name: '',
  beeLevel: 4,
  blackOwnership: 0,
  blackWomenOwnership: 0,
  youthOwnership: 0,
  disabledOwnership: 0,
  enterpriseType: 'generic' as 'eme' | 'qse' | 'generic',
  spend: 0,
  certificateExpiryDate: '',
  isForeignSupplier: false,
  isEmpoweringSupplier: false,
  isSupplierDevRecipient: false,
  hasThreeYearContract: false,
};

// VERIFIED AGAINST: BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx
// Procurement: 29 points total
// - Empowering Suppliers: 5 pts at 80%
// - QSE: 3 pts at 15%
// - EME: 4 pts at 15%
// - ≥51% Black Owned: 11 pts at 50%
// - ≥30% Black Women Owned: 4 pts at 12%
// - Designated Group: 2 pts at 2%

export default function Procurement() {
  const { procurement, client, addSupplier, updateSupplier, removeSupplier, updateTMPS, calculatorConfig } = useBbeeStore();
  const { tmps, suppliers } = procurement;
  const { toast } = useToast();

  const [isManualTmps, setIsManualTmps] = useState(!!procurement.tmpsManualOverride);
  const [manualTmpsValue, setManualTmpsValue] = useState(tmps);

  const calculatedTmps = suppliers.reduce((acc, s) => acc + s.spend, 0);

  const handleTmpsToggle = (manual: boolean) => {
    setIsManualTmps(manual);
    if (!manual) {
      updateTMPS(calculatedTmps);
    }
  };

  const handleManualTmpsChange = (value: number) => {
    setManualTmpsValue(value);
    updateTMPS(value);
  };

  const [isSupOpen, setIsSupOpen] = useState(false);
  const [newSup, setNewSup] = useState({ ...emptySupplierForm });

  const [isEditSupOpen, setIsEditSupOpen] = useState(false);
  const [editSupId, setEditSupId] = useState<string | null>(null);
  const [editSup, setEditSup] = useState({ ...emptySupplierForm });

  const getBeeLevelColor = (level: number) => {
    if (level === 1) return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300";
    if (level <= 3) return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300";
    if (level <= 6) return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300";
    if (level <= 8) return "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300";
    return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300";
  };

  const getRecognitionPercentage = (level: number) => {
    const table: Record<number, number> = { 1: 135, 2: 125, 3: 110, 4: 100, 5: 80, 6: 60, 7: 50, 8: 10, 0: 0 };
    return table[level] || 0;
  };

  const totalRecognisedSpend = suppliers.reduce((acc, sup) => acc + (sup.spend * (getRecognitionPercentage(sup.beeLevel) / 100)), 0);

  // Issue 3: Added isForeignSupplier to addSupplier
  const handleAddSupplier = () => {
    if (!newSup.name || newSup.spend <= 0) {
      toast({ title: "Invalid", description: "Name and spend are required.", variant: "destructive" });
      return;
    }
    addSupplier({
      id: uuidv4(),
      name: newSup.name,
      beeLevel: Number(newSup.beeLevel) as any,
      blackOwnership: Number(newSup.blackOwnership) / 100,
      blackWomenOwnership: Number(newSup.blackWomenOwnership) / 100,
      youthOwnership: Number(newSup.youthOwnership) / 100,
      disabledOwnership: Number(newSup.disabledOwnership) / 100,
      enterpriseType: newSup.enterpriseType,
      spend: Number(newSup.spend),
      certificateExpiryDate: newSup.certificateExpiryDate || undefined,
      isForeignSupplier: newSup.isForeignSupplier,
    });
    setNewSup({ ...emptySupplierForm });
    setIsSupOpen(false);
    toast({ title: "Supplier Added", description: `${newSup.name} added to procurement.` });
  };

  // Issue 3: Added isForeignSupplier to edit form
  const openEditSupplier = (sup: Supplier) => {
    setEditSupId(sup.id);
    setEditSup({
      name: sup.name,
      beeLevel: sup.beeLevel,
      blackOwnership: sup.blackOwnership * 100,
      blackWomenOwnership: sup.blackWomenOwnership * 100,
      youthOwnership: sup.youthOwnership * 100,
      disabledOwnership: sup.disabledOwnership * 100,
      enterpriseType: sup.enterpriseType,
      spend: sup.spend,
      certificateExpiryDate: sup.certificateExpiryDate || '',
      isForeignSupplier: sup.isForeignSupplier || false,
    });
    setIsEditSupOpen(true);
  };

  // Issue 3: Added isForeignSupplier to updateSupplier
  const handleEditSupplier = () => {
    if (!editSupId || !editSup.name || editSup.spend <= 0) {
      toast({ title: "Invalid", description: "Name and spend are required.", variant: "destructive" });
      return;
    }
    updateSupplier(editSupId, {
      name: editSup.name,
      beeLevel: Number(editSup.beeLevel) as any,
      blackOwnership: Number(editSup.blackOwnership) / 100,
      blackWomenOwnership: Number(editSup.blackWomenOwnership) / 100,
      youthOwnership: Number(editSup.youthOwnership) / 100,
      disabledOwnership: Number(editSup.disabledOwnership) / 100,
      enterpriseType: editSup.enterpriseType,
      spend: Number(editSup.spend),
      certificateExpiryDate: editSup.certificateExpiryDate || undefined,
      isForeignSupplier: editSup.isForeignSupplier,
    });
    setIsEditSupOpen(false);
    setEditSupId(null);
    toast({ title: "Supplier Updated", description: `${editSup.name} has been updated.` });
  };

  if (!calculatorConfig) return <div className="p-8 text-center text-muted-foreground">Loading calculator config... Select a sector first.</div>;
  const score = calculateProcurementScore(procurement, calculatorConfig);

  // Issue 3: Added isForeignSupplier to form fields
  const renderSupplierFormFields = (
    data: typeof emptySupplierForm,
    setData: (d: typeof emptySupplierForm) => void,
  ) => (
    <div className="grid gap-4 py-4">
      <div className="grid grid-cols-4 items-start gap-4">
        <Label className="text-right pt-2">Foreign</Label>
        <div className="col-span-3 flex items-center gap-2">
          <input
            type="checkbox"
            checked={data.isForeignSupplier}
            onChange={e => setData({ ...data, isForeignSupplier: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300"
            data-testid="input-supplier-foreign"
          />
          <span className="text-sm text-muted-foreground">Foreign Supplier (excluded from Empowering Supplier recognition, included in TMPS)</span>
        </div>
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label className="text-right">Name</Label>
        <Input
          value={data.name}
          onChange={e => setData({ ...data, name: e.target.value })}
          className="col-span-3"
          data-testid="input-supplier-name"
        />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label className="text-right">Spend (R)</Label>
        <Input
          type="number"
          value={data.spend}
          onChange={e => setData({ ...data, spend: Number(e.target.value) })}
          className="col-span-3"
          data-testid="input-supplier-spend"
        />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label className="text-right">B-BBEE Level</Label>
        <Input
          type="number"
          min="0"
          max="8"
          value={data.beeLevel}
          onChange={e => setData({ ...data, beeLevel: Number(e.target.value) })}
          className="col-span-3"
          data-testid="input-supplier-bee-level"
        />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label className="text-right">Enterprise Type</Label>
        <Select value={data.enterpriseType} onValueChange={v => setData({ ...data, enterpriseType: v as 'eme' | 'qse' | 'generic' })}>
          <SelectTrigger className="col-span-3" data-testid="select-supplier-enterprise-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="eme">EME</SelectItem>
            <SelectItem value="qse">QSE</SelectItem>
            <SelectItem value="generic">Generic</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label className="text-right">Black %</Label>
        <Input
          type="number"
          value={data.blackOwnership}
          onChange={e => setData({ ...data, blackOwnership: Number(e.target.value) })}
          className="col-span-3"
          data-testid="input-supplier-black-ownership"
        />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label className="text-right">Black Women %</Label>
        <Input
          type="number"
          value={data.blackWomenOwnership}
          onChange={e => setData({ ...data, blackWomenOwnership: Number(e.target.value) })}
          className="col-span-3"
          data-testid="input-supplier-black-women-ownership"
        />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label className="text-right">Youth %</Label>
        <Input
          type="number"
          value={data.youthOwnership}
          onChange={e => setData({ ...data, youthOwnership: Number(e.target.value) })}
          className="col-span-3"
          data-testid="input-supplier-youth-ownership"
        />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label className="text-right">Disabled %</Label>
        <Input
          type="number"
          value={data.disabledOwnership}
          onChange={e => setData({ ...data, disabledOwnership: Number(e.target.value) })}
          className="col-span-3"
          data-testid="input-supplier-disabled-ownership"
        />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label className="text-right">Certificate Expiry</Label>
        <Input
          type="date"
          value={data.certificateExpiryDate}
          onChange={e => setData({ ...data, certificateExpiryDate: e.target.value })}
          className="col-span-3"
          data-testid="input-supplier-certificate-expiry"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold">Preferential Procurement</h1>
          <p className="text-muted-foreground mt-1">Manage supplier spend and B-BBEE compliance. 29 points available.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isSupOpen} onOpenChange={setIsSupOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2" data-testid="btn-add-supplier">
                <ShoppingCart className="h-4 w-4" /> Add Supplier
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Supplier</DialogTitle></DialogHeader>
              {renderSupplierFormFields(newSup, setNewSup)}
              <DialogFooter><Button onClick={handleAddSupplier} data-testid="btn-save-supplier">Save Supplier</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Dialog open={isEditSupOpen} onOpenChange={setIsEditSupOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Supplier</DialogTitle></DialogHeader>
          {renderSupplierFormFields(editSup, setEditSup)}
          <DialogFooter><Button onClick={handleEditSupplier} data-testid="btn-update-supplier">Update Supplier</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="glass-panel" data-testid="card-procurement-summary">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Measured Procurement Spend (TMPS)</CardTitle>
              <div className="flex items-center gap-2">
                <Label htmlFor="tmps-toggle" className="text-[11px] text-muted-foreground cursor-pointer">
                  {isManualTmps ? 'Manual' : 'Calculated'}
                </Label>
                <Switch
                  id="tmps-toggle"
                  checked={isManualTmps}
                  onCheckedChange={handleTmpsToggle}
                  data-testid="toggle-tmps-manual"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isManualTmps ? (
              <div className="space-y-2">
                <Input
                  type="number"
                  value={manualTmpsValue}
                  onChange={e => handleManualTmpsChange(Number(e.target.value))}
                  className="text-lg font-bold font-heading"
                  data-testid="input-tmps-manual"
                />
                <div className="text-[11px] text-muted-foreground">
                  Calculated from suppliers: {formatRand(calculatedTmps)}
                </div>
              </div>
            ) : (
              <div className="text-3xl font-bold font-heading">
                {formatRand(tmps)}
              </div>
            )}
            <div className="flex justify-between items-center mt-4 text-sm border-t pt-2">
              <span className="text-muted-foreground">Recognised Spend</span>
              <span className="font-medium text-emerald-600">{formatRand(totalRecognisedSpend)}</span>
            </div>
          </CardContent>
        </Card>
        
        <Card className="glass-panel" data-testid="card-procurement-score">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Procurement Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-heading text-primary">
              {round2(score.total).toFixed(2)} / 29
            </div>
            <div className="flex gap-4 mt-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                Base: {round2(score.base).toFixed(2)}
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                Sub-min: {score.subMinimumMet ? 'Met' : 'Not Met'}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel" data-testid="card-supplier-count">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Suppliers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-heading">
              {suppliers.length}
            </div>
            <div className="flex gap-4 mt-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-chart-4"></div>
                EME: {suppliers.filter(s => s.enterpriseType === 'eme').length}
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-chart-2"></div>
                QSE: {suppliers.filter(s => s.enterpriseType === 'qse').length}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel mt-8 mb-8" data-testid="card-procurement-detailed-scorecard">
        <CardHeader>
          <CardTitle>Detailed Scorecard Breakdown</CardTitle>
          <CardDescription>Direct translation of GP Excel toolkit calculations (29 points)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <div className="bg-muted/30 px-4 py-3 border-b text-sm text-muted-foreground flex justify-between items-center">
              <span>Target: 29 points | Max spend recognition: 135%</span>
            </div>
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Criteria</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">Target Points</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">Target %</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">Actual Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {score.subLines.map((line, idx) => (
                  <tr key={idx} className={cn("hover:bg-muted/30", line.isBonus && "bg-amber-50/50 dark:bg-amber-950/20")}>
                    <td className="px-4 py-3 text-muted-foreground">
                      {line.isBonus && <Badge variant="outline" className="text-[9px] mr-1.5 bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300">Bonus</Badge>}
                      {line.name}
                    </td>
                    <td className="px-4 py-3 text-right font-mono whitespace-nowrap">{line.weighting.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono whitespace-nowrap">{line.target}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-primary whitespace-nowrap">{round2(line.score).toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="bg-primary/5 border-t-2 border-primary/20">
                  <td className="px-4 py-3 text-primary font-semibold uppercase text-xs tracking-wider">Procurement Total</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-primary whitespace-nowrap">{score.subLines.reduce((a, l) => a + l.weighting, 0).toFixed(2)}</td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-primary whitespace-nowrap">{round2(score.total).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel" data-testid="card-top-suppliers">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            Suppliers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">Supplier</th>
                  <th className="h-10 px-4 text-center font-medium text-muted-foreground">Lvl</th>
                  <th className="h-10 px-4 text-center font-medium text-muted-foreground">Type</th>
                  <th className="h-10 px-4 text-right font-medium text-muted-foreground">Spend</th>
                  <th className="h-10 px-4 text-right font-medium text-muted-foreground">Black %</th>
                  <th className="h-10 px-4 text-right font-medium text-muted-foreground">Rec.</th>
                  <th className="h-10 px-4 text-center font-medium text-muted-foreground">Cert Expiry</th>
                  <th className="h-10 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {suppliers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="font-medium">No suppliers added yet</p>
                      <p className="text-sm mt-1">Add your first supplier to start tracking procurement spend.</p>
                    </td>
                  </tr>
                ) : suppliers.map((sup) => {
                  const recognition = getRecognitionPercentage(sup.beeLevel);
                  const recognisedValue = sup.spend * (recognition / 100);
                  return (
                    <tr key={sup.id} className="border-b last:border-0 hover:bg-muted/30 group" data-testid={`row-supplier-${sup.id}`}>
                      <td className="p-4 font-medium">{sup.name}</td>
                      <td className="p-4 text-center">
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded border", getBeeLevelColor(sup.beeLevel))}>
                          L{sup.beeLevel}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <Badge variant="outline" className="text-[10px] uppercase" data-testid={`text-enterprise-type-${sup.id}`}>
                          {sup.enterpriseType}
                        </Badge>
                      </td>
                      <td className="p-4 text-right font-mono">{formatRand(sup.spend)}</td>
                      <td className="p-4 text-right font-mono text-muted-foreground">{(sup.blackOwnership * 100).toFixed(0)}%</td>
                      <td className="p-4 text-right font-medium font-mono text-emerald-600">{formatRand(recognisedValue)}</td>
                      <td className="p-4 text-center">
                        {sup.certificateExpiryDate ? (
                          <span className={cn(
                            "text-[11px] font-medium px-2 py-0.5 rounded",
                            new Date(sup.certificateExpiryDate) < new Date()
                              ? "bg-destructive/10 text-destructive border border-destructive/20"
                              : "text-muted-foreground"
                          )}>
                            {new Date(sup.certificateExpiryDate).toLocaleDateString('en-ZA')}
                            {new Date(sup.certificateExpiryDate) < new Date() && " (Expired)"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40 text-[11px]">—</span>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        <div className="flex items-center justify-end gap-1 invisible group-hover:visible">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditSupplier(sup)}
                            data-testid={`btn-edit-supplier-${sup.id}`}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => removeSupplier(sup.id)}
                            data-testid={`btn-delete-supplier-${sup.id}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

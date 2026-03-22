import { useState } from "react";
import { useBbeeStore } from "@toolkit/lib/store";
import { calculateOwnershipScore } from "@toolkit/lib/calculators/ownership";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Badge } from "@toolkit/components/ui/badge";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
import { Label } from "@toolkit/components/ui/label";
import { Plus, Edit, Trash2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@toolkit/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@toolkit/components/ui/select";
import { v4 as uuidv4 } from "uuid";
import { useToast } from "@toolkit/hooks/use-toast";
import type { Shareholder } from "@toolkit/lib/types";

const OWNERSHIP_TYPE_LABELS: Record<string, string> = {
  shareholder: "Shareholder",
  sale_of_assets: "Sale of Assets",
  equity_equivalent: "Equity Equivalent",
};

const emptyForm = {
  name: '',
  ownershipType: 'shareholder' as Shareholder['ownershipType'],
  shares: 0,
  blackOwnership: 0,
  blackWomenOwnership: 0,
  shareValue: 0,
  blackNewEntrant: false,
};

export default function Ownership() {
  const { ownership, addShareholder, updateShareholder, removeShareholder, updateCompanyValue } = useBbeeStore();
  const { toast } = useToast();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newSh, setNewSh] = useState({ ...emptyForm });
  const [editSh, setEditSh] = useState({ ...emptyForm });

  const [companyVal, setCompanyVal] = useState(ownership.companyValue);
  const [debtVal, setDebtVal] = useState(ownership.outstandingDebt);

  const score = calculateOwnershipScore(ownership);

  const chartData = ownership.shareholders.map(sh => ({
    name: sh.name,
    value: sh.shares,
    blackOwnership: sh.blackOwnership
  }));

  const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

  const handleAdd = () => {
    if (!newSh.name || newSh.shares <= 0) {
      toast({ title: "Invalid input", description: "Name and shares are required.", variant: "destructive" });
      return;
    }

    addShareholder({
      id: uuidv4(),
      name: newSh.name,
      ownershipType: newSh.ownershipType,
      shares: Number(newSh.shares),
      blackOwnership: Number(newSh.blackOwnership) / 100,
      blackWomenOwnership: Number(newSh.blackWomenOwnership) / 100,
      shareValue: Number(newSh.shareValue),
      blackNewEntrant: newSh.blackNewEntrant,
    });

    setNewSh({ ...emptyForm });
    setIsAddOpen(false);
    toast({ title: "Shareholder Added", description: `${newSh.name} has been added to the cap table.` });
  };

  const handleEditOpen = (sh: Shareholder) => {
    setEditingId(sh.id);
    setEditSh({
      name: sh.name,
      ownershipType: sh.ownershipType,
      shares: sh.shares,
      blackOwnership: sh.blackOwnership * 100,
      blackWomenOwnership: sh.blackWomenOwnership * 100,
      shareValue: sh.shareValue,
      blackNewEntrant: sh.blackNewEntrant || false,
    });
    setIsEditOpen(true);
  };

  const handleEditSave = () => {
    if (!editingId || !editSh.name || editSh.shares <= 0) {
      toast({ title: "Invalid input", description: "Name and shares are required.", variant: "destructive" });
      return;
    }

    updateShareholder(editingId, {
      name: editSh.name,
      ownershipType: editSh.ownershipType,
      shares: Number(editSh.shares),
      blackOwnership: Number(editSh.blackOwnership) / 100,
      blackWomenOwnership: Number(editSh.blackWomenOwnership) / 100,
      shareValue: Number(editSh.shareValue),
      blackNewEntrant: editSh.blackNewEntrant,
    });

    setIsEditOpen(false);
    setEditingId(null);
    toast({ title: "Shareholder Updated", description: `${editSh.name} has been updated.` });
  };

  const handleUpdateValuation = () => {
    updateCompanyValue(Number(companyVal), Number(debtVal));
    toast({ title: "Valuation Updated", description: "Company value and debt have been saved." });
  };

  const shareholderFormFields = (
    formState: typeof emptyForm,
    setFormState: (val: typeof emptyForm) => void,
    prefix: string,
  ) => (
    <div className="grid gap-4 py-4">
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor={`${prefix}-name`} className="text-right">Name</Label>
        <Input
          id={`${prefix}-name`}
          value={formState.name}
          onChange={e => setFormState({ ...formState, name: e.target.value })}
          className="col-span-3"
          data-testid={`input-${prefix}-name`}
        />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor={`${prefix}-type`} className="text-right">Type</Label>
        <div className="col-span-3">
          <Select
            value={formState.ownershipType}
            onValueChange={(val) => setFormState({ ...formState, ownershipType: val as Shareholder['ownershipType'] })}
          >
            <SelectTrigger data-testid={`select-${prefix}-ownership-type`}>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="shareholder">Shareholder</SelectItem>
              <SelectItem value="sale_of_assets">Sale of Assets</SelectItem>
              <SelectItem value="equity_equivalent">Equity Equivalent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor={`${prefix}-shares`} className="text-right">Shares</Label>
        <Input
          id={`${prefix}-shares`}
          type="number"
          value={formState.shares}
          onChange={e => setFormState({ ...formState, shares: Number(e.target.value) })}
          className="col-span-3"
          data-testid={`input-${prefix}-shares`}
        />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor={`${prefix}-blackOwnership`} className="text-right">Black %</Label>
        <Input
          id={`${prefix}-blackOwnership`}
          type="number"
          value={formState.blackOwnership}
          onChange={e => setFormState({ ...formState, blackOwnership: Number(e.target.value) })}
          className="col-span-3"
          placeholder="0-100"
          data-testid={`input-${prefix}-black-ownership`}
        />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor={`${prefix}-blackWomenOwnership`} className="text-right">Black Women %</Label>
        <Input
          id={`${prefix}-blackWomenOwnership`}
          type="number"
          value={formState.blackWomenOwnership}
          onChange={e => setFormState({ ...formState, blackWomenOwnership: Number(e.target.value) })}
          className="col-span-3"
          placeholder="0-100"
          data-testid={`input-${prefix}-black-women-ownership`}
        />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label className="text-right">New Entrant</Label>
        <div className="col-span-3">
          <Select
            value={formState.blackNewEntrant ? "yes" : "no"}
            onValueChange={(val) => setFormState({ ...formState, blackNewEntrant: val === "yes" })}
          >
            <SelectTrigger data-testid={`select-${prefix}-new-entrant`}>
              <SelectValue placeholder="Black New Entrant?" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="no">No</SelectItem>
              <SelectItem value="yes">Yes — Black New Entrant</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-3xl font-heading font-bold">Ownership</h1>
          <p className="text-muted-foreground mt-1">
            Manage your company's shareholding structure and voting rights.
          </p>
        </div>

        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="btn-add-shareholder">
              <Plus className="h-4 w-4" />
              Add Shareholder
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add Shareholder</DialogTitle>
              <DialogDescription>
                Enter the details for the new shareholder. Black ownership should be entered as a percentage.
              </DialogDescription>
            </DialogHeader>
            {shareholderFormFields(newSh, setNewSh, "add")}
            <DialogFooter>
              <Button type="submit" onClick={handleAdd} data-testid="btn-save-shareholder">Save Shareholder</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Shareholder</DialogTitle>
            <DialogDescription>
              Update the details for this shareholder.
            </DialogDescription>
          </DialogHeader>
          {shareholderFormFields(editSh, setEditSh, "edit")}
          <DialogFooter>
            <Button type="submit" onClick={handleEditSave} data-testid="btn-update-shareholder">Update Shareholder</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Voting</p>
            <p className="text-2xl font-bold font-mono text-primary" data-testid="text-voting-score">{score.votingRightsBlack.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Economic Int.</p>
            <p className="text-2xl font-bold font-mono text-primary" data-testid="text-economic-score">{score.economicInterestBlack.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Net Value</p>
            <p className="text-2xl font-bold font-mono text-primary" data-testid="text-net-value-score">{score.netValue.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className={score.subMinimumMet ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/10 dark:border-emerald-800" : "bg-destructive/10 border-destructive/20"}>
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Sub-minimum</p>
            <p className={`text-sm font-bold mt-1 ${score.subMinimumMet ? 'text-emerald-600' : 'text-destructive'}`} data-testid="text-sub-minimum-status">
              {score.subMinimumMet ? 'PASSED' : 'FAILED (<3.2)'}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-primary text-primary-foreground shadow-md">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <p className="text-xs font-medium uppercase tracking-wider mb-1 opacity-80">Total Score</p>
            <p className="text-3xl font-bold font-mono" data-testid="text-total-ownership-score">{score.total.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel mt-8" data-testid="card-ownership-detailed-scorecard">
        <CardHeader>
          <CardTitle>Detailed Scorecard Breakdown</CardTitle>
          <CardDescription>7 sub-line indicators per RCOGP Generic Codes</CardDescription>
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
              </tbody>
              <tfoot className="bg-primary/5 font-bold border-t-2 border-primary/20">
                <tr>
                  <td className="px-4 py-4 text-primary font-medium uppercase tracking-wider" colSpan={2}>Total Ownership Score</td>
                  <td className="px-4 py-4 text-right font-mono">25.00</td>
                  <td className="px-4 py-4 text-right font-mono text-lg text-primary">{score.total.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {score.fullOwnershipAwarded && (
            <div className="mt-3 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-md text-sm text-emerald-700 dark:text-emerald-300">
              Full Ownership Awarded — Black voting ≥ 25%, all indicators receive full points.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="glass-panel col-span-2" data-testid="card-shareholders-list">
          <CardHeader>
            <CardTitle>Shareholders</CardTitle>
            <CardDescription>Current cap table and B-BBEE recognition</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="h-10 px-4 text-left font-medium text-muted-foreground">Entity / Individual</th>
                    <th className="h-10 px-4 text-left font-medium text-muted-foreground">Type</th>
                    <th className="h-10 px-4 text-right font-medium text-muted-foreground">Shares</th>
                    <th className="h-10 px-4 text-right font-medium text-muted-foreground">Black %</th>
                    <th className="h-10 px-4 text-right font-medium text-muted-foreground">Black Women %</th>
                    <th className="h-10 px-4 text-center font-medium text-muted-foreground">New Entrant</th>
                    <th className="h-10 px-4 text-right font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ownership.shareholders.map((sh, idx) => (
                    <tr key={sh.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-4 font-medium" data-testid={`sh-name-${idx}`}>{sh.name}</td>
                      <td className="p-4" data-testid={`sh-type-${idx}`}>
                        <Badge variant="secondary">
                          {OWNERSHIP_TYPE_LABELS[sh.ownershipType] || sh.ownershipType}
                        </Badge>
                      </td>
                      <td className="p-4 text-right" data-testid={`sh-shares-${idx}`}>{sh.shares}</td>
                      <td className="p-4 text-right">
                        <Badge variant={sh.blackOwnership > 0 ? "default" : "secondary"} data-testid={`sh-black-pct-${idx}`}>
                          {(sh.blackOwnership * 100).toFixed(1)}%
                        </Badge>
                      </td>
                      <td className="p-4 text-right" data-testid={`sh-bw-pct-${idx}`}>
                        {(sh.blackWomenOwnership * 100).toFixed(1)}%
                      </td>
                      <td className="p-4 text-center" data-testid={`sh-new-entrant-${idx}`}>
                        {sh.blackNewEntrant ? (
                          <Badge variant="default" className="text-[10px]">Yes</Badge>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">No</span>
                        )}
                      </td>
                      <td className="p-4 text-right flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditOpen(sh)}
                          data-testid={`btn-edit-shareholder-${idx}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => removeShareholder(sh.id)}
                          data-testid={`btn-delete-shareholder-${idx}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {ownership.shareholders.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        No shareholders added yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="glass-panel" data-testid="card-company-valuation">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Company Valuation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Company Value (ZAR)</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={companyVal}
                    onChange={e => setCompanyVal(Number(e.target.value))}
                    className="font-mono"
                    data-testid="input-company-value"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Outstanding Debt (ZAR)</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={debtVal}
                    onChange={e => setDebtVal(Number(e.target.value))}
                    className="font-mono"
                    data-testid="input-outstanding-debt"
                  />
                </div>
              </div>
              <Button size="sm" className="w-full" onClick={handleUpdateValuation} data-testid="btn-update-valuation">Update Valuation</Button>

              <div className="flex justify-between gap-2 items-center mt-2 text-sm border-t pt-4">
                <span className="text-muted-foreground">Net Value</span>
                <span className="font-medium text-emerald-600" data-testid="text-net-value">R {((ownership.companyValue - ownership.outstandingDebt) / 1000000).toFixed(1)}M</span>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel" data-testid="card-ownership-chart">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Share Split</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [`${value}`, 'Shares']}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
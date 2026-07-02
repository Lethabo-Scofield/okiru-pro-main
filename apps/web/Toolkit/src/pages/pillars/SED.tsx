import { useState } from "react";
import { useBbeeStore } from "@toolkit/lib/store";
import { useFieldErrors } from "@toolkit/hooks/useFieldErrors";
import { CalculatorConfigGate } from "@toolkit/components/layout/CalculatorConfigGate";
import { calculateSedScore } from "@toolkit/lib/calculators/esd-sed";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Badge } from "@toolkit/components/ui/badge";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
import { NumberInput } from "@toolkit/components/ui/number-input";
import { Label } from "@toolkit/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@toolkit/components/ui/select";
import { Plus, HeartHandshake, Trash2 } from "lucide-react";
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
import { pillarSectorSubtitle } from "@toolkit/lib/sectors/sector-labels";

export default function SED() {
  const { sed, client, addSedContribution, removeSedContribution, updateSedSpend, calculatorConfig } = useBbeeStore();
  const { contributions } = sed;
  const { toast } = useToast();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newSed, setNewSed] = useState({
    beneficiary: '',
    type: 'grant',
    amount: 0,
    // Construction-only flags. Read by construction-map.ts:91/93 — engine
    // already scores these but no UI to enter (audit Wave 3 safe subset).
    isStructuredProject: false,
    isLimitedServicesCommunity: false,
  });
  const errs = useFieldErrors();
  const isConstructionSector = String(calculatorConfig?.sectorCode ?? '').toUpperCase() === 'CONSTRUCTION';

  const npat = client.npat;
  // Drive target % and max points from the sector calculatorConfig instead of
  // the hardcoded RCOGP 1% / 5pt (audit A10). calculateSedScore already uses
  // sc.npatTarget, so this is a display-only refactor and produces the same
  // numbers for RCOGP while showing the correct target for AGRI / FSC / etc.
  const sedConfig = calculatorConfig?.sed as {
    npatTarget?: number;
    ceMaxPts?: number;
    ceTargetPct?: number;
    ceBonusMaxPts?: number;
    ceBonusTargetPct?: number;
    fundisaMaxPts?: number;
    fundisaTargetPct?: number;
  } | undefined;
  const npatTargetPct = sedConfig?.npatTarget ?? 0.01;
  const sedMaxPoints = calculatorConfig?.pillarConfigs?.socioEconomicDevelopment?.maxPoints ?? 5;
  const targetSpend = npat * npatTargetPct;
  const targetPctLabel = `${(npatTargetPct * 100).toFixed(npatTargetPct < 0.01 ? 2 : 0)}%`;
  const actualSpend = contributions.reduce((acc, c) => acc + c.amount, 0);
  // FSC-only: surface Consumer Education + Fundisa spend inputs. calculateSedScore
  // already reads sed.ceSpend / ceBonusSpend / fundisaSpend and gates the scoring
  // on these config keys — adding the UI is purely under-ingestion, not a math
  // change (audit A10 / B11 safe subset).
  const fscSedActive = (sedConfig?.ceMaxPts ?? 0) > 0 || (sedConfig?.fundisaMaxPts ?? 0) > 0;

  const getTypeColor = (type: string) => {
    switch(type) {
      case 'grant': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200';
      case 'employee_time': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200';
      default: return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200';
    }
  };

  const handleAdd = () => {
    const beneficiaryBad = !newSed.beneficiary.trim();
    const amountBad = !(newSed.amount > 0);
    if (beneficiaryBad || amountBad) {
      errs.setMany({ beneficiary: beneficiaryBad, amount: amountBad });
      toast({ title: "Invalid", description: "Beneficiary and amount are required.", variant: "destructive" });
      return;
    }
    
    addSedContribution({
      id: uuidv4(),
      beneficiary: newSed.beneficiary,
      type: newSed.type as any,
      amount: Number(newSed.amount),
      category: 'socio_economic',
      // Construction-only — read by construction-map.ts; non-construction
      // sectors always pass false so the indicators stay dormant.
      isStructuredProject: newSed.isStructuredProject,
      isLimitedServicesCommunity: newSed.isLimitedServicesCommunity,
    } as any);

    setNewSed({ beneficiary: '', type: 'grant', amount: 0, isStructuredProject: false, isLimitedServicesCommunity: false });
    setIsAddOpen(false);
    toast({ title: "Contribution Added", description: `Added to SED ledger.` });
  };

  if (!calculatorConfig) return <CalculatorConfigGate>{null}</CalculatorConfigGate>;
  const score = calculateSedScore(sed, npat, calculatorConfig);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold">Socio-Economic Dev</h1>
          <p className="text-muted-foreground mt-1">Manage your CSI and SED contributions.</p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) errs.reset(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="btn-add-sed">
              <Plus className="h-4 w-4" />
              Add Contribution
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add SED Contribution</DialogTitle>
              <DialogDescription>Record a new socio-economic development initiative.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Beneficiary</Label>
                <div className="col-span-3 space-y-1">
                  <Input
                    value={newSed.beneficiary}
                    onChange={e => { setNewSed({...newSed, beneficiary: e.target.value}); errs.clear('beneficiary'); }}
                    aria-invalid={errs.has('beneficiary') || undefined}
                    aria-describedby={errs.has('beneficiary') ? 'sed-beneficiary-error' : undefined}
                    className={cn(errs.has('beneficiary') && "border-destructive focus-visible:ring-destructive")}
                  />
                  {errs.has('beneficiary') && <p id="sed-beneficiary-error" className="text-xs text-destructive">Beneficiary is required.</p>}
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Amount (R)</Label>
                <div className="col-span-3 space-y-1">
                  <NumberInput
                    value={newSed.amount}
                    onValueChange={v => { setNewSed({...newSed, amount: v}); if (v > 0) errs.clear('amount'); }}
                    aria-invalid={errs.has('amount') || undefined}
                    aria-describedby={errs.has('amount') ? 'sed-amount-error' : undefined}
                    className={errs.has('amount') ? "border-destructive focus-visible:ring-destructive" : undefined}
                  />
                  {errs.has('amount') && <p id="sed-amount-error" className="text-xs text-destructive">Amount must be greater than 0.</p>}
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Type</Label>
                <Select value={newSed.type} onValueChange={v => setNewSed({...newSed, type: v})}>
                  <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grant">Grant</SelectItem>
                    <SelectItem value="employee_time">Employee Time</SelectItem>
                    <SelectItem value="overhead_costs">Overhead Costs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isConstructionSector && (
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right text-xs text-muted-foreground">Construction flags</Label>
                  <div className="col-span-3 space-y-2 text-sm">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newSed.isStructuredProject}
                        onChange={e => setNewSed({...newSed, isStructuredProject: e.target.checked})}
                      />
                      Structured Project (Construction SED indicator)
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newSed.isLimitedServicesCommunity}
                        onChange={e => setNewSed({...newSed, isLimitedServicesCommunity: e.target.checked})}
                      />
                      Limited-Services Community
                    </label>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={handleAdd}>Save Contribution</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="glass-panel" data-testid="card-npat">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Profit After Tax (NPAT)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-heading">
              {formatRand(npat)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Base for {targetPctLabel} SED target</p>
          </CardContent>
        </Card>

        <Card className="glass-panel lg:col-span-2" data-testid="card-sed-progress">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Target Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-end mb-2">
              <div>
                <div className="text-3xl font-bold font-heading text-primary">
                  {formatRand(actualSpend)}
                </div>
                <div className="text-sm text-muted-foreground mt-1">Actual Spend</div>
              </div>
              <div className="text-right">
                <div className="text-xl font-semibold text-muted-foreground">
                  {formatRand(targetSpend)}
                </div>
                <div className="text-sm text-muted-foreground mt-1">Target ({targetPctLabel})</div>
              </div>
            </div>
            <div className="mt-4 h-3 w-full bg-secondary rounded-full overflow-hidden">
              <div 
                className={cn("h-full rounded-full transition-all duration-500", actualSpend >= targetSpend ? "bg-emerald-500" : "bg-chart-5")}
                style={{ width: `${Math.min(100, (actualSpend / targetSpend) * 100)}%` }}
              />
            </div>
            {actualSpend >= targetSpend && (
              <p className="text-xs text-emerald-600 font-medium mt-2 text-right">Target Achieved 🎉</p>
            )}
          </CardContent>
        </Card>
      </div>

      {fscSedActive && (
        <Card className="glass-panel mt-8" data-testid="card-fsc-sed-spend">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">FSC Consumer Education & Fundisa</CardTitle>
            <CardDescription className="text-xs">
              Annual spend per FSC SED sub-element. The scorecard already weights these — values entered here flow directly into the score.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="grid gap-4 sm:grid-cols-3">
              {(sedConfig?.ceMaxPts ?? 0) > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="sed-ce-spend" className="text-xs">
                    Consumer Education Spend (R)
                    {sedConfig?.ceTargetPct != null && (
                      <span className="text-muted-foreground ml-1">· target {(sedConfig.ceTargetPct * 100).toFixed(2)}% NPAT</span>
                    )}
                  </Label>
                  <NumberInput
                    id="sed-ce-spend"
                    value={sed.ceSpend ?? 0}
                    onValueChange={(v) => updateSedSpend({ ceSpend: v })}
                    placeholder="R"
                  />
                </div>
              )}
              {(sedConfig?.ceBonusMaxPts ?? 0) > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="sed-ce-bonus" className="text-xs">
                    CE Bonus Spend (R)
                    {sedConfig?.ceBonusTargetPct != null && (
                      <span className="text-muted-foreground ml-1">· target {(sedConfig.ceBonusTargetPct * 100).toFixed(2)}% NPAT</span>
                    )}
                  </Label>
                  <NumberInput
                    id="sed-ce-bonus"
                    value={sed.ceBonusSpend ?? 0}
                    onValueChange={(v) => updateSedSpend({ ceBonusSpend: v })}
                    placeholder="R"
                  />
                </div>
              )}
              {(sedConfig?.fundisaMaxPts ?? 0) > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="sed-fundisa" className="text-xs">
                    Fundisa Spend (R)
                    {sedConfig?.fundisaTargetPct != null && (
                      <span className="text-muted-foreground ml-1">· target {(sedConfig.fundisaTargetPct * 100).toFixed(2)}% NPAT</span>
                    )}
                  </Label>
                  <NumberInput
                    id="sed-fundisa"
                    value={sed.fundisaSpend ?? 0}
                    onValueChange={(v) => updateSedSpend({ fundisaSpend: v })}
                    placeholder="R"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="glass-panel mt-8 mb-8" data-testid="card-sed-detailed-scorecard">
        <CardHeader>
          <CardTitle>Detailed Scorecard Breakdown</CardTitle>
          <CardDescription>
            {pillarSectorSubtitle(
              client,
              calculatorConfig,
              calculatorConfig?.pillarConfigs?.socioEconomicDevelopment?.maxPoints,
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <div className="bg-muted/30 px-4 py-3 border-b text-sm text-muted-foreground flex justify-between items-center">
              <span>data as at <strong className="text-foreground">{client.measurementPeriodEnd ? new Date(client.measurementPeriodEnd).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}</strong></span>
            </div>
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Indicator</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Criteria</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">Target Points</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">Target %</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">Actual Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">Socio-Economic Development</td>
                  <td className="px-4 py-3 text-muted-foreground">Annual value of all Socio-Economic Development Contributions made by the Measured Entity as a percentage of the target</td>
                  <td className="px-4 py-3 text-right font-mono whitespace-nowrap">{sedMaxPoints.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-mono whitespace-nowrap">{targetPctLabel}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-primary whitespace-nowrap">{score.total.toFixed(2)}</td>
                </tr>
              </tbody>
              <tfoot className="bg-primary/5 font-bold border-t-2 border-primary/20">
                <tr>
                  <td className="px-4 py-4 text-primary font-medium uppercase tracking-wider" colSpan={2}>Total SED Score</td>
                  <td className="px-4 py-4 text-right font-mono whitespace-nowrap">{sedMaxPoints.toFixed(2)}</td>
                  <td className="px-4 py-4"></td>
                  <td className="px-4 py-4 text-right font-mono text-lg text-primary whitespace-nowrap">{score.total.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel" data-testid="card-sed-contributions">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HeartHandshake className="h-5 w-5 text-primary" />
            Contributions Ledger
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">Beneficiary Name</th>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">Type</th>
                  <th className="h-10 px-4 text-right font-medium text-muted-foreground">Amount</th>
                  <th className="h-10 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {contributions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                      <HeartHandshake className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="font-medium">No contributions yet</p>
                      <p className="text-sm mt-1">Add your first SED contribution to start tracking.</p>
                    </td>
                  </tr>
                ) : contributions.map((c, idx) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors group">
                    <td className="p-4 font-medium" data-testid={`sed-beneficiary-${idx}`}>{c.beneficiary}</td>
                    <td className="p-4">
                      <span className={cn("text-xs px-2 py-1 rounded-md border capitalize", getTypeColor(c.type))}>
                        {c.type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-4 text-right font-mono font-medium">R {c.amount.toLocaleString()}</td>
                    <td className="p-2 text-right">
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive" onClick={() => removeSedContribution(c.id)}><Trash2 className="h-3 w-3" /></Button>
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
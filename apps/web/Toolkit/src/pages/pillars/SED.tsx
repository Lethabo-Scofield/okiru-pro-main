import { useState } from "react";
import { useBbeeStore } from "@toolkit/lib/store";
import { calculateSedScore } from "@toolkit/lib/calculators/esd-sed";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Badge } from "@toolkit/components/ui/badge";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
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

export default function SED() {
  const { sed, client, addSedContribution, removeSedContribution } = useBbeeStore();
  const { contributions } = sed;
  const { toast } = useToast();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newSed, setNewSed] = useState({ beneficiary: '', type: 'grant', amount: 0 });

  const npat = client.npat; 
  const targetSpend = npat * 0.01;
  const actualSpend = contributions.reduce((acc, c) => acc + c.amount, 0);

  const getTypeColor = (type: string) => {
    switch(type) {
      case 'grant': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200';
      case 'employee_time': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200';
      default: return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200';
    }
  };

  const handleAdd = () => {
    if (!newSed.beneficiary || newSed.amount <= 0) {
      toast({ title: "Invalid", description: "Beneficiary and amount are required.", variant: "destructive" });
      return;
    }
    
    addSedContribution({
      id: uuidv4(),
      beneficiary: newSed.beneficiary,
      type: newSed.type as any,
      amount: Number(newSed.amount),
      category: 'socio_economic'
    });
    
    setNewSed({ beneficiary: '', type: 'grant', amount: 0 });
    setIsAddOpen(false);
    toast({ title: "Contribution Added", description: `Added to SED ledger.` });
  };

  const score = calculateSedScore(sed, npat);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold">Socio-Economic Dev</h1>
          <p className="text-muted-foreground mt-1">Manage your CSI and SED contributions.</p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
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
                <Input value={newSed.beneficiary} onChange={e => setNewSed({...newSed, beneficiary: e.target.value})} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Amount (R)</Label>
                <Input type="number" value={newSed.amount} onChange={e => setNewSed({...newSed, amount: Number(e.target.value)})} className="col-span-3" />
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
            <p className="text-xs text-muted-foreground mt-1">Base for 1% SED target</p>
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
                <div className="text-sm text-muted-foreground mt-1">Target (1%)</div>
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

      <Card className="glass-panel mt-8 mb-8" data-testid="card-sed-detailed-scorecard">
        <CardHeader>
          <CardTitle>Detailed Scorecard Breakdown</CardTitle>
          <CardDescription>Direct translation of GP Excel toolkit calculations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <div className="bg-muted/30 px-4 py-3 border-b text-sm text-muted-foreground flex justify-between items-center">
              <span>data as at <strong className="text-foreground">24 February 2026</strong></span>
            </div>
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Indicator</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Criteria</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Target Points</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Target %</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Actual Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {/* Socio-Economic Development */}
                <tr className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">Socio-Economic Development</td>
                  <td className="px-4 py-3 text-muted-foreground">Annual value of all Socio-Economic Development Contributions made by the Measured Entity as a percentage of the target</td>
                  <td className="px-4 py-3 text-right font-mono">5.00</td>
                  <td className="px-4 py-3 text-right font-mono">1%</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-primary">{Math.min(5, (score.rawStats?.spendSED || 0) / (npat * 0.01) * 5).toFixed(2)}</td>
                </tr>
              </tbody>
              <tfoot className="bg-primary/5 font-bold border-t-2 border-primary/20">
                <tr>
                  <td className="px-4 py-4 text-primary font-medium uppercase tracking-wider" colSpan={2}>Total SED Score</td>
                  <td className="px-4 py-4 text-right font-mono">5.00</td>
                  <td className="px-4 py-4"></td>
                  <td className="px-4 py-4 text-right font-mono text-lg text-primary">{score.total.toFixed(2)}</td>
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
import { useState, useMemo } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@toolkit/components/ui/card";
import { Button } from "@toolkit/components/ui/button";
import { Badge } from "@toolkit/components/ui/badge";
import { Calculator, TrendingUp, AlertTriangle, Plus, Trash2, Info, ArrowRight, LineChart as LineChartIcon } from "lucide-react";
import { useBbeeStore } from "@toolkit/lib/store";
import { useToast } from "@toolkit/hooks/use-toast";
import { Input } from "@toolkit/components/ui/input";
import { NumberInput } from "@toolkit/components/ui/number-input";
import { Label } from "@toolkit/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@toolkit/components/ui/tooltip";
import { Switch } from "@toolkit/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@toolkit/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { v4 as uuidv4 } from 'uuid';
import {
  resolveNpatForTargets,
  marginPercent,
  isBelowIndustryNormQuarterThreshold,
} from "@/lib/npatDeemedCalculation";
import { lookupIndustryNormPercent } from "@/lib/industryNormLookup";

export default function Financials() {
  const { client, updateFinancials, updateTMPS, procurement, addFinancialYear, updateFinancialYear, removeFinancialYear } = useBbeeStore();
  const { toast } = useToast();
  
  const [revenue, setRevenue] = useState<number>(client.revenue);
  const [npat, setNpat] = useState<number>(client.npat);
  const [leviableAmount, setLeviableAmount] = useState<number>(client.leviableAmount);
  const [tmpsInclusions, setTmpsInclusions] = useState({
    costOfSales: 0,
    operatingExpenses: 0,
    capitalExpenditure: 0,
    other: 0
  });

  const [tmpsExclusions, setTmpsExclusions] = useState({
    imports: 0,
    salaries: 0,
    statutory: 0,
    depreciation: 0,
    other: 0
  });
  
  const [showDraftRules, setShowDraftRules] = useState(false);
  const [tmpsManualOverride, setTmpsManualOverride] = useState(procurement.tmpsManualOverride || false);
  const [tmpsManualValue, setTmpsManualValue] = useState<number>(procurement.tmps);

  const currentIndustryNorm = useMemo(() => {
    if (client.industryNorm != null && client.industryNorm > 0) return client.industryNorm;
    return lookupIndustryNormPercent(client.industry, client.sectorCode) ?? 0;
  }, [client.industryNorm, client.industry, client.sectorCode]);

  const showPriorYearHistory = isBelowIndustryNormQuarterThreshold(
    client.revenue,
    client.npat,
    currentIndustryNorm,
  );

  const priorYearsForNpat = useMemo(
    () =>
      (client.financialHistory || []).slice(0, 5).map((h) => ({
        yearLabel: h.year,
        revenue: h.revenue,
        npat: h.npat,
      })),
    [client.financialHistory],
  );

  const npatResolution = useMemo(
    () =>
      resolveNpatForTargets({
        currentRevenue: client.revenue,
        currentNpat: client.npat,
        industryNormPercent: currentIndustryNorm,
        priorYears: priorYearsForNpat,
      }),
    [client.revenue, client.npat, currentIndustryNorm, priorYearsForNpat],
  );

  const currentMargin = marginPercent(client.npat, client.revenue);
  const threshold = currentIndustryNorm / 4;
  const isBelowQuarter = npatResolution.deemedNpatUsed;
  const deemedNpat = npatResolution.effectiveNpat;
  const targetBase = deemedNpat;

  // TMPS Calculations
  const totalInclusions = Object.values(tmpsInclusions).reduce((a, b) => a + Number(b || 0), 0);
  const totalExclusions = Object.values(tmpsExclusions).reduce((a, b) => a + Number(b || 0), 0);
  const calculatedTMPS = Math.max(0, totalInclusions - totalExclusions);

  const handleSaveFinancials = () => {
    const normToSave =
      currentIndustryNorm > 0
        ? currentIndustryNorm
        : lookupIndustryNormPercent(client.industry, client.sectorCode);
    updateFinancials(revenue, npat, leviableAmount, normToSave);
    toast({
      title: "Financials Updated",
      description: "Base financial metrics have been saved.",
    });
  };

  const handleSaveTMPS = () => {
    updateTMPS(calculatedTMPS, false);
    toast({
      title: "TMPS Updated",
      description: "Total Measured Procurement Spend has been saved.",
    });
  };

  const handleAddYear = () => {
    const nextYear = String(new Date().getFullYear() - client.financialHistory.length - 1);
    addFinancialYear({
      id: uuidv4(),
      year: nextYear,
      revenue: 0,
      npat: 0,
    });
  };

  // Chart data
  const chartData = useMemo(() => {
    const data = [...client.financialHistory].reverse().map(h => ({
      name: h.year,
      Revenue: h.revenue,
      NPAT: h.npat
    }));
    // Add current year
    data.push({
      name: client.financialYear,
      Revenue: client.revenue,
      NPAT: client.npat
    });
    return data;
  }, [client.financialHistory, client.revenue, client.npat, client.financialYear]);

  // Averages
  const avgData = [...client.financialHistory, { year: client.financialYear, revenue: client.revenue, npat: client.npat }];
  const avgNPAT = avgData.reduce((acc, curr) => acc + curr.npat, 0) / avgData.length || 0;
  const avgMargin = avgData.reduce((acc, curr) => acc + (curr.revenue > 0 ? (curr.npat/curr.revenue)*100 : 0), 0) / avgData.length || 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-7xl mx-auto pb-12">
      <div>
        <h1 className="text-3xl font-heading font-bold tracking-tight text-foreground">Financials Overview & TMPS Calculator</h1>
        <p className="text-muted-foreground mt-1 text-lg">
          Manage your historical financial data, compute Deemed NPAT, and calculate Total Measured Procurement Spend.
        </p>
      </div>

      {/* Summary Hero Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="glass-panel bg-primary/5 border-primary/20">
          <CardContent className="p-4 flex flex-col justify-center h-full text-center">
            <div className="text-xs font-semibold text-primary/80 uppercase mb-1">Current Revenue</div>
            <div className="text-2xl font-bold font-heading text-primary">R {(client.revenue / 1000000).toFixed(1)}M</div>
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardContent className="p-4 flex flex-col justify-center h-full text-center">
            <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Current NPAT</div>
            <div className="text-2xl font-bold font-heading">R {(client.npat / 1000000).toFixed(1)}M</div>
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardContent className="p-4 flex flex-col justify-center h-full text-center">
            <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">NPAT Margin</div>
            <div className={`text-2xl font-bold font-heading ${isBelowQuarter ? 'text-amber-500' : 'text-emerald-500'}`}>
              {currentMargin.toFixed(2)}%
            </div>
          </CardContent>
        </Card>
        <Card className={`glass-panel border-2 ${isBelowQuarter ? 'border-amber-200 bg-amber-50/50' : 'border-emerald-200 bg-emerald-50/50'}`}>
          <CardContent className="p-4 flex flex-col justify-center h-full text-center relative">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                   <div className="absolute top-2 right-2">
                    <Info className="h-4 w-4 text-muted-foreground" />
                   </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Target base for ESD/SED. {isBelowQuarter ? 'Uses Deemed NPAT (Revenue × Industry Norm)' : 'Uses Actual NPAT'}.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="text-xs font-semibold uppercase mb-1">Deemed NPAT (ESD Base)</div>
            <div className={`text-2xl font-bold font-heading ${isBelowQuarter ? 'text-amber-600' : 'text-emerald-600'}`}>
              R {(targetBase / 1000000).toFixed(1)}M
            </div>
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardContent className="p-4 flex flex-col justify-center h-full text-center">
            <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">TMPS (Procurement)</div>
            <div className="text-2xl font-bold font-heading">R {(procurement.tmps / 1000000).toFixed(1)}M</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Financials Input */}
        <div className="lg:col-span-2 space-y-6">
          {showPriorYearHistory ? (
          <Card className="glass-panel">
            <CardHeader className="pb-4">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Prior-Year Financials (Deemed NPAT)</CardTitle>
                  <CardDescription>
                    Required when current NPAT margin is below 25% of the industry norm — used for Leibrandt / deemed NPAT
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={handleAddYear} className="flex gap-2">
                  <Plus className="h-4 w-4" /> Add Year
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border mb-6 overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Year</TableHead>
                      <TableHead>Revenue (R)</TableHead>
                      <TableHead>NPAT (R)</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="bg-primary/5 font-medium">
                      <TableCell>{client.financialYear} (Current)</TableCell>
                      <TableCell>
                        <NumberInput value={revenue} onValueChange={setRevenue} className="h-8" />
                      </TableCell>
                      <TableCell>
                        <NumberInput value={npat} onValueChange={setNpat} className="h-8" />
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {(revenue > 0 ? (npat / revenue) * 100 : 0).toFixed(2)}%
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                    
                    {client.financialHistory.map((history) => (
                      <TableRow key={history.id}>
                        <TableCell>
                          <Input 
                            value={history.year} 
                            onChange={(e) => updateFinancialYear(history.id, { year: e.target.value })} 
                            className="h-8 w-24" 
                          />
                        </TableCell>
                        <TableCell>
                          <NumberInput
                            value={history.revenue}
                            onValueChange={(v) => updateFinancialYear(history.id, { revenue: v })}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <NumberInput
                            value={history.npat}
                            onValueChange={(v) => updateFinancialYear(history.id, { npat: v })}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {(history.revenue > 0 ? (history.npat / history.revenue) * 100 : 0).toFixed(2)}%
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => removeFinancialYear(history.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Leviable Amount (Payroll)</Label>
                  <NumberInput value={leviableAmount} onValueChange={setLeviableAmount} />
                  <p className="text-xs text-muted-foreground">Used as the base for Skills Development targets.</p>
                </div>
                <div className="space-y-2">
                  <Label>Industry Norm (%)</Label>
                  <Input
                    type="number"
                    value={currentIndustryNorm > 0 ? currentIndustryNorm : ""}
                    readOnly
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Auto-detected from industry / sector selection.
                  </p>
                </div>
                <div className="flex items-end sm:col-span-2">
                  <Button className="w-full" onClick={handleSaveFinancials}>Save Current Financials</Button>
                </div>
              </div>
            </CardContent>
          </Card>
          ) : (
          <Card className="glass-panel">
            <CardHeader className="pb-4">
              <CardTitle>Current-Year Financials</CardTitle>
              <CardDescription>Revenue and NPAT for the measurement period</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Revenue (R)</Label>
                  <NumberInput value={revenue} onValueChange={setRevenue} />
                </div>
                <div className="space-y-2">
                  <Label>NPAT (R)</Label>
                  <NumberInput value={npat} onValueChange={setNpat} />
                </div>
                <div className="space-y-2">
                  <Label>Leviable Amount (Payroll)</Label>
                  <NumberInput value={leviableAmount} onValueChange={setLeviableAmount} />
                </div>
                <div className="space-y-2">
                  <Label>Industry Norm (%)</Label>
                  <Input
                    type="number"
                    value={currentIndustryNorm > 0 ? currentIndustryNorm : ""}
                    readOnly
                    disabled
                    className="bg-muted"
                  />
                </div>
              </div>
              <Button className="w-full" onClick={handleSaveFinancials}>Save Current Financials</Button>
            </CardContent>
          </Card>
          )}

          {/* TMPS Calculation */}
          <Card className="glass-panel">
            <CardHeader className="pb-4">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>TMPS Calculation</CardTitle>
                  <CardDescription>Total Measured Procurement Spend (Feeds Procurement Scorecard)</CardDescription>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch id="draft-rules" checked={showDraftRules} onCheckedChange={setShowDraftRules} />
                  <Label htmlFor="draft-rules" className="text-xs cursor-pointer">Draft 2026 Rules</Label>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {showDraftRules && (
                <div className="bg-primary/5 border border-primary/20 text-primary rounded-md p-3 text-xs mb-6 flex gap-2">
                  <Info className="h-4 w-4 shrink-0" />
                  <p>Draft 2026 changes emphasize 100% black-owned targets. Imports require an ESD plan if not capital goods/value-add (per Code 400).</p>
                </div>
              )}
              
              <div className="grid md:grid-cols-2 gap-8">
                {/* Inclusions */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground border-b pb-2">Inclusions (+)</h4>
                  
                  <div className="space-y-3">
                    <div className="grid grid-cols-[1fr_120px] gap-2 items-center">
                      <Label className="text-sm">Cost of Sales</Label>
                      <NumberInput className="h-8 text-right font-mono" value={tmpsInclusions.costOfSales} onValueChange={v => setTmpsInclusions({...tmpsInclusions, costOfSales: v})} />
                    </div>
                    <div className="grid grid-cols-[1fr_120px] gap-2 items-center">
                      <Label className="text-sm">Operating Expenses</Label>
                      <NumberInput className="h-8 text-right font-mono" value={tmpsInclusions.operatingExpenses} onValueChange={v => setTmpsInclusions({...tmpsInclusions, operatingExpenses: v})} />
                    </div>
                    <div className="grid grid-cols-[1fr_120px] gap-2 items-center">
                      <Label className="text-sm">Capital Expenditure</Label>
                      <NumberInput className="h-8 text-right font-mono" value={tmpsInclusions.capitalExpenditure} onValueChange={v => setTmpsInclusions({...tmpsInclusions, capitalExpenditure: v})} />
                    </div>
                    <div className="grid grid-cols-[1fr_120px] gap-2 items-center">
                      <Label className="text-sm">Other</Label>
                      <NumberInput className="h-8 text-right font-mono" value={tmpsInclusions.other} onValueChange={v => setTmpsInclusions({...tmpsInclusions, other: v})} />
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center pt-2 border-t font-semibold">
                    <span>Total Inclusions</span>
                    <span className="font-mono">R {totalInclusions.toLocaleString()}</span>
                  </div>
                </div>

                {/* Exclusions */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground border-b pb-2">Exclusions (-)</h4>
                  
                  <div className="space-y-3">
                    <div className="grid grid-cols-[1fr_120px] gap-2 items-center">
                      <Label className="text-sm">Permissible Imports</Label>
                      <NumberInput className="h-8 text-right font-mono" value={tmpsExclusions.imports} onValueChange={v => setTmpsExclusions({...tmpsExclusions, imports: v})} />
                    </div>
                    <div className="grid grid-cols-[1fr_120px] gap-2 items-center">
                      <Label className="text-sm">Salaries & Wages</Label>
                      <NumberInput className="h-8 text-right font-mono" value={tmpsExclusions.salaries} onValueChange={v => setTmpsExclusions({...tmpsExclusions, salaries: v})} />
                    </div>
                    <div className="grid grid-cols-[1fr_120px] gap-2 items-center">
                      <Label className="text-sm">Statutory (PAYE, UIF, etc)</Label>
                      <NumberInput className="h-8 text-right font-mono" value={tmpsExclusions.statutory} onValueChange={v => setTmpsExclusions({...tmpsExclusions, statutory: v})} />
                    </div>
                    <div className="grid grid-cols-[1fr_120px] gap-2 items-center">
                      <Label className="text-sm">Depreciation/Bad Debts</Label>
                      <NumberInput className="h-8 text-right font-mono" value={tmpsExclusions.depreciation} onValueChange={v => setTmpsExclusions({...tmpsExclusions, depreciation: v})} />
                    </div>
                    <div className="grid grid-cols-[1fr_120px] gap-2 items-center">
                      <Label className="text-sm">Other Exclusions</Label>
                      <NumberInput className="h-8 text-right font-mono" value={tmpsExclusions.other} onValueChange={v => setTmpsExclusions({...tmpsExclusions, other: v})} />
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center pt-2 border-t font-semibold">
                    <span>Total Exclusions</span>
                    <span className="font-mono">R {totalExclusions.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="bg-muted/30 border-t flex flex-col gap-4 p-4">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  <Switch checked={tmpsManualOverride} onCheckedChange={(checked) => { setTmpsManualOverride(checked); }} data-testid="toggle-tmps-override" />
                  <Label className="text-sm font-medium cursor-pointer">{tmpsManualOverride ? "Manual TMPS Override" : "Use Calculated TMPS"}</Label>
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground/50 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-[220px] text-xs">
                      <p>Toggle between calculated TMPS (from inclusions minus exclusions) or enter a manual value directly.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {tmpsManualOverride ? (
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 w-full">
                  <div className="flex items-center gap-3">
                    <Label className="text-sm">Manual TMPS:</Label>
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-mono text-muted-foreground">R</span>
                      <NumberInput
                        className="w-40 h-9 text-right font-mono font-bold text-primary"
                        value={tmpsManualValue}
                        onValueChange={setTmpsManualValue}
                        data-testid="input-tmps-manual"
                      />
                    </div>
                  </div>
                  <Button onClick={() => { updateTMPS(tmpsManualValue, true); toast({ title: "TMPS Updated", description: "Manual TMPS value saved." }); }} data-testid="btn-save-manual-tmps">
                    Save Manual TMPS
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 w-full">
                  <div className="flex items-center gap-4">
                    <span className="text-lg font-semibold">Calculated TMPS:</span>
                    <span className="text-2xl font-bold font-heading text-primary">R {calculatedTMPS.toLocaleString()}</span>
                  </div>
                  <Button onClick={handleSaveTMPS} variant={procurement.tmps === calculatedTMPS ? "secondary" : "default"} data-testid="btn-update-tmps">
                    {procurement.tmps === calculatedTMPS ? "TMPS Up to Date" : "Update Scorecard TMPS"}
                  </Button>
                </div>
              )}

              <div className="text-xs text-muted-foreground border-t pt-2 w-full">
                Current scorecard TMPS: <span className="font-mono font-semibold">R {procurement.tmps.toLocaleString()}</span>
              </div>
            </CardFooter>
          </Card>
        </div>

        {/* Right Column: Insights & Trends */}
        <div className="space-y-6">
          {/* Trend Chart */}
          <Card className="glass-panel h-[350px] flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <LineChartIcon className="h-4 w-4 text-primary" />
                Financial Trends
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-grow">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => `R${val/1000000}m`} tick={{ fontSize: 12 }} />
                  <TooltipProvider>
                    <TooltipContent />
                  </TooltipProvider>
                  <Line type="monotone" dataKey="Revenue" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="NPAT" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Average Stats */}
          <Card className="glass-panel">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm">Historical Averages ({avgData.length} Yrs)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center pb-2 border-b">
                <span className="text-sm text-muted-foreground">Average NPAT</span>
                <span className="font-semibold">R {(avgNPAT/1000000).toFixed(1)}M</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b">
                <span className="text-sm text-muted-foreground">Average Margin</span>
                <span className="font-semibold">{avgMargin.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  Industry Norm
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                         <Info className="h-3 w-3" />
                      </TooltipTrigger>
                      <TooltipContent><p>User-entered norm margin (%) for deemed NPAT / Leibrandt tests</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </span>
                <span className="font-semibold text-primary">
                  {currentIndustryNorm > 0 ? `${currentIndustryNorm.toFixed(2)}%` : "Not set"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">25% Threshold</span>
                <span className="font-semibold text-amber-600">{threshold.toFixed(2)}%</span>
              </div>
            </CardContent>
          </Card>

          {/* Target Impact Preview */}
          <Card className="glass-panel bg-primary/5 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Procurement Target Impact</CardTitle>
              <CardDescription className="text-xs">Based on saved TMPS (R{(procurement.tmps/1000000).toFixed(1)}M)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">All Empowering Suppliers (80%)</span>
                <span className="text-sm font-semibold">R {((procurement.tmps * 0.8)/1000000).toFixed(1)}M</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">51% Black Owned (50%)</span>
                <span className="text-sm font-semibold">R {((procurement.tmps * 0.5)/1000000).toFixed(1)}M</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">30% Black Women Owned (12%)</span>
                <span className="text-sm font-semibold">R {((procurement.tmps * 0.12)/1000000).toFixed(1)}M</span>
              </div>
            </CardContent>
            <CardFooter className="pt-0">
              <Link href="/pillars/procurement" className="inline-flex items-center px-0 h-auto text-xs w-full justify-start text-primary hover:underline">
                View Detailed Scorecard <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </CardFooter>
          </Card>

        </div>
      </div>
    </div>
  );
}
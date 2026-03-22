import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@toolkit/components/ui/card";
import { Button } from "@toolkit/components/ui/button";
import { Badge } from "@toolkit/components/ui/badge";
import { Building, TrendingDown, TrendingUp, AlertTriangle, Search, Info, Download, Filter, Calendar } from "lucide-react";
import { useBbeeStore } from "@toolkit/lib/store";
import { useToast } from "@toolkit/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@toolkit/components/ui/select";
import { Input } from "@toolkit/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@toolkit/components/ui/tooltip";
import { Switch } from "@toolkit/components/ui/switch";
import { Label } from "@toolkit/components/ui/label";
import { industryNormsData, industriesList, quartersList } from "@toolkit/lib/data/industry-norms";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@toolkit/components/ui/table";

export default function IndustryNorms() {
  const { client, updateFinancials, isScenarioMode } = useBbeeStore();
  const { toast } = useToast();
  const [applied, setApplied] = useState(false);
  const [selectedIndustry, setSelectedIndustry] = useState("All industries");
  const [selectedQuarter, setSelectedQuarter] = useState(quartersList[0]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDraftRules, setShowDraftRules] = useState(false);

  // Derive current norm
  const currentNormEntry = useMemo(() => {
    return industryNormsData.find(d => d.industry === selectedIndustry && d.quarter === selectedQuarter) 
        || industryNormsData.find(d => d.industry === selectedIndustry)
        || industryNormsData[0];
  }, [selectedIndustry, selectedQuarter]);

  const industryNorm = Math.max(0, currentNormEntry.norm); // Floor at 0%
  const isNegativeNorm = currentNormEntry.norm < 0;
  const isHistorical = currentNormEntry.quarter !== quartersList[0];

  const currentMargin = (client.npat / client.revenue) * 100;
  
  const threshold = industryNorm / 4; // 25% of industry norm
  const isBelowQuarter = currentMargin < threshold;

  const deemedNpat = isBelowQuarter ? (client.revenue * (industryNorm / 100)) : client.npat;

  // Calculate targets based on either real NPAT or deemed NPAT
  const targetBase = deemedNpat;
  const esdTarget = targetBase * (showDraftRules ? 0.03 : 0.02); // Draft rule alternative
  const edTarget = targetBase * 0.01;
  const sedTarget = targetBase * 0.01;

  const applyNorm = () => {
    updateFinancials(client.revenue, isBelowQuarter ? deemedNpat : client.npat, client.leviableAmount, industryNorm);
    setApplied(true);
    toast({
      title: "Deemed NPAT Applied",
      description: `ESD and SED targets have been updated to use ${isBelowQuarter ? 'Deemed NPAT based on Industry Norm' : 'Actual NPAT'}.`,
    });
  };

  const filteredHistory = useMemo(() => {
    return industryNormsData.filter(d => 
      d.industry.toLowerCase().includes(searchQuery.toLowerCase()) || 
      d.quarter.toLowerCase().includes(searchQuery.toLowerCase())
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [searchQuery]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl mx-auto pb-12">
      <div>
        <h1 className="text-3xl font-heading font-bold tracking-tight text-foreground">Industry Norms Lookup & Deemed NPAT Calculator</h1>
        <p className="text-muted-foreground mt-1 text-lg">
          Determine if your NPAT margin meets the 25% sub-minimum threshold for B-BBEE ESD & SED targets.
        </p>
      </div>

      {/* Top Section - Quick Selector & Summary Card */}
      <Card className="glass-panel border-primary/20 shadow-lg shadow-primary/5">
        <CardHeader className="bg-primary/5 border-b border-primary/10 pb-6">
          <div className="flex flex-col md:flex-row gap-6 justify-between items-start">
            <div className="w-full md:w-2/3 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                    <Building className="h-4 w-4" />
                    Industry Sector
                  </Label>
                  <Select value={selectedIndustry} onValueChange={setSelectedIndustry}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select industry" />
                    </SelectTrigger>
                    <SelectContent>
                      {industriesList.map(ind => (
                        <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Publication Quarter
                  </Label>
                  <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select quarter" />
                    </SelectTrigger>
                    <SelectContent>
                      {quartersList.map(q => {
                        const entry = industryNormsData.find(d => d.quarter === q);
                        return (
                          <SelectItem key={q} value={q}>
                            {q} – {entry ? new Date(entry.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="w-full md:w-1/3 bg-background rounded-xl p-4 border shadow-sm flex flex-col justify-center items-center text-center relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent z-0"></div>
              <div className="relative z-10">
                <div className="text-sm text-muted-foreground font-medium mb-1">Industry Norm Margin</div>
                <div className={`text-4xl font-bold font-heading flex items-center justify-center gap-2 ${isNegativeNorm ? 'text-amber-500' : 'text-emerald-600'}`}>
                  {currentNormEntry.norm.toFixed(2)}%
                </div>
                
                <div className="flex flex-wrap gap-2 justify-center mt-3">
                  {isHistorical ? (
                    <Badge variant="secondary" className="text-xs">Historical Data</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">Latest Available</Badge>
                  )}
                  {isNegativeNorm && (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                      Negative Margin (Floor 0%)
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-4 text-right">
            Source: Stats SA P0044 Quarterly Financial Statistics
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bottom Section - Deemed NPAT Calculator (Left Column) */}
        <Card className="glass-panel flex flex-col">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              Deemed NPAT Calculator
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>If your actual NPAT margin is less than 25% of the industry norm, your targets are calculated using Deemed NPAT (Revenue × Industry Norm).</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
            <CardDescription>Determines the base value for your ESD and SED targets.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 flex-grow">
            
            {/* Step 1: Comparison */}
            <div className="bg-muted/30 rounded-xl p-4 border space-y-4">
              <h4 className="text-sm font-semibold text-foreground/80 uppercase tracking-wider mb-2">Step 1: Margin Comparison</h4>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Your Actual Margin:</span>
                <span className="font-mono font-medium">{currentMargin.toFixed(2)}%</span>
              </div>
              
              <div className="flex justify-between items-center pb-2 border-b">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  25% of Industry Norm:
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent><p>25% of {industryNorm.toFixed(2)}%</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </span>
                <span className="font-mono font-medium">{threshold.toFixed(2)}%</span>
              </div>

              <div className="pt-2 flex items-start gap-3">
                {isBelowQuarter ? (
                  <>
                    <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Below Threshold</p>
                      <p className="text-xs text-amber-600/80 dark:text-amber-500/80">Your margin is below 25% of the norm. You must use Deemed NPAT.</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="h-5 w-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                      <div className="h-2 w-2 rounded-full bg-emerald-600"></div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Threshold Met</p>
                      <p className="text-xs text-emerald-600/80 dark:text-emerald-500/80">Your margin meets the requirement. You can use Actual NPAT.</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Step 2: Result */}
            <div className={`rounded-xl p-5 border-2 transition-all ${isBelowQuarter ? 'border-amber-200 bg-amber-50/30' : 'border-emerald-200 bg-emerald-50/30'}`}>
              <h4 className="text-sm font-semibold text-foreground/80 uppercase tracking-wider mb-4">Step 2: Target Base Value</h4>
              
              <div className="flex flex-col items-center text-center space-y-2">
                <span className="text-sm text-muted-foreground font-medium">
                  {isBelowQuarter ? 'Using Deemed NPAT (Revenue × Norm)' : 'Using Actual NPAT'}
                </span>
                <span className={`text-4xl font-bold font-heading ${isBelowQuarter ? 'text-amber-600' : 'text-emerald-600'}`}>
                  R {(deemedNpat).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>

          </CardContent>
          <CardFooter className="pt-4 border-t">
            <Button 
              className="w-full" 
              size="lg"
              variant={applied ? "secondary" : "default"} 
              disabled={applied && client.industryNorm === industryNorm}
              onClick={applyNorm}
            >
              {applied && client.industryNorm === industryNorm ? "Applied to Scorecard" : "Apply as Target Base"}
            </Button>
          </CardFooter>
        </Card>

        {/* Impact Preview (Right Column) */}
        <Card className="glass-panel flex flex-col">
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle>Target Impact Preview</CardTitle>
              <div className="flex items-center space-x-2">
                <Switch id="draft-rules" checked={showDraftRules} onCheckedChange={setShowDraftRules} />
                <Label htmlFor="draft-rules" className="text-xs text-muted-foreground cursor-pointer">Preview Draft Rules</Label>
              </div>
            </div>
            <CardDescription>How this affects your actual B-BBEE spending targets.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 flex-grow">
            
            {showDraftRules && (
              <div className="bg-primary/5 border border-primary/20 text-primary rounded-md p-3 text-xs mb-4 flex gap-2">
                <Info className="h-4 w-4 shrink-0" />
                <p>Showing draft Transformation Fund alternative: 3% NPAT → up to 20 ESD points (pending finalisation).</p>
              </div>
            )}

            <div className="space-y-4">
              <div className="group relative bg-background border rounded-lg p-4 hover:border-primary/50 transition-colors">
                <div className="flex justify-between items-center mb-2">
                  <div className="font-semibold flex items-center gap-2">
                    Supplier Development
                    <Badge variant="secondary" className="text-[10px]">10 Points</Badge>
                  </div>
                  <span className="text-sm font-mono text-muted-foreground">{showDraftRules ? '3%' : '2%'} of NPAT</span>
                </div>
                <div className="text-2xl font-bold font-heading">
                  R {esdTarget.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                {isBelowQuarter && !applied && (
                  <div className="absolute top-4 right-4 text-xs text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    Will increase by R {(esdTarget - (client.revenue * (currentMargin/100) * (showDraftRules ? 0.03 : 0.02))).toLocaleString(undefined, {maximumFractionDigits:0})}
                  </div>
                )}
              </div>

              <div className="group relative bg-background border rounded-lg p-4 hover:border-primary/50 transition-colors">
                <div className="flex justify-between items-center mb-2">
                  <div className="font-semibold flex items-center gap-2">
                    Enterprise Development
                    <Badge variant="secondary" className="text-[10px]">5 Points</Badge>
                  </div>
                  <span className="text-sm font-mono text-muted-foreground">1% of NPAT</span>
                </div>
                <div className="text-2xl font-bold font-heading">
                  R {edTarget.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>

              <div className="group relative bg-background border rounded-lg p-4 hover:border-primary/50 transition-colors">
                <div className="flex justify-between items-center mb-2">
                  <div className="font-semibold flex items-center gap-2">
                    Socio-Economic Dev
                    <Badge variant="secondary" className="text-[10px]">5 Points</Badge>
                  </div>
                  <span className="text-sm font-mono text-muted-foreground">1% of NPAT</span>
                </div>
                <div className="text-2xl font-bold font-heading">
                  R {sedTarget.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
            </div>

          </CardContent>
        </Card>
      </div>

      {/* Middle Section - Norms History Table */}
      <Card className="glass-panel">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle>Historical Norms Data</CardTitle>
              <CardDescription>Full history of Stats SA P0044 quarterly releases</CardDescription>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Filter by industry or quarter..."
                  className="pl-8"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button variant="outline" size="icon" title="Download CSV">
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[150px]">Publication Date</TableHead>
                  <TableHead className="w-[120px]">Quarter</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead className="text-right">Norm Margin</TableHead>
                  <TableHead className="w-[200px]">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHistory.length > 0 ? (
                  filteredHistory.map((row, i) => {
                    const isSelected = row.industry === selectedIndustry && row.quarter === selectedQuarter;
                    const isNegative = row.norm < 0;
                    return (
                      <TableRow 
                        key={i} 
                        className={isSelected ? "bg-primary/5 hover:bg-primary/10" : ""}
                      >
                        <TableCell className="font-medium">
                          {new Date(row.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </TableCell>
                        <TableCell>{row.quarter}</TableCell>
                        <TableCell className={isSelected ? "font-semibold text-primary" : ""}>
                          {row.industry}
                        </TableCell>
                        <TableCell className={`text-right font-mono ${isSelected ? 'font-bold' : ''} ${isNegative ? 'text-amber-600' : ''}`}>
                          {row.norm.toFixed(2)}%
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {isNegative ? "Negative – floored at 0%" : ""}
                          {isSelected && <Badge variant="secondary" className="ml-2">Selected</Badge>}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      No matching records found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
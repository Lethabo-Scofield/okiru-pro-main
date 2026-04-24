import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Input } from "@toolkit/components/ui/input";
import { Label } from "@toolkit/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@toolkit/components/ui/select";
import { Switch } from "@toolkit/components/ui/switch";
import { DollarSign, TrendingUp, Calculator, AlertTriangle, Info, ArrowRight } from "lucide-react";
import { cn } from "@toolkit/lib/utils";

// Industry norms from TOOLKIT_TAB_MAP.md
const INDUSTRY_NORMS: Record<string, number> = {
  'Retail': 4,
  'Manufacturing': 6,
  'IT Services': 10,
  'Financial Services': 15,
  'Construction': 4,
  'Agriculture': 6,
  'Mining': 12,
  'Transport': 5,
  'Hospitality': 8,
  'Healthcare': 10,
  'Education': 5,
  'Professional Services': 12,
  'Real Estate': 15,
  'Telecommunications': 12,
  'Energy': 15,
  'Other': 6,
};

export interface FinancialsData {
  // Core financials
  totalRevenue: number;
  npat: number;
  leviableAmount: number;
  totalPayroll?: number;
  
  // TMPS components
  tmpsInclusions: number;
  tmpsExclusions: number;
  
  // Industry norm
  industry: string;
  
  // Derived (calculated)
  tmps: number;
  currentMargin: number;
  quarterThreshold: number;
  isBelowQuarter: boolean;
  deemedNpat: number;
  deemedNpatUsed: boolean;
}

interface FinancialsFormProps {
  data: FinancialsData;
  onChange: (data: FinancialsData) => void;
  className?: string;
  readOnly?: boolean;
}

export const EMPTY_FINANCIALS: FinancialsData = {
  totalRevenue: 0,
  npat: 0,
  leviableAmount: 0,
  totalPayroll: 0,
  tmpsInclusions: 0,
  tmpsExclusions: 0,
  industry: 'Other',
  tmps: 0,
  currentMargin: 0,
  quarterThreshold: 0,
  isBelowQuarter: false,
  deemedNpat: 0,
  deemedNpatUsed: false,
};

/**
 * Calculate derived financial values
 */
export function calculateFinancials(base: Partial<FinancialsData>): FinancialsData {
  const totalRevenue = base.totalRevenue || 0;
  const npat = base.npat || 0;
  const leviableAmount = base.leviableAmount || 0;
  const totalPayroll = base.totalPayroll || 0;
  const tmpsInclusions = base.tmpsInclusions || 0;
  const tmpsExclusions = base.tmpsExclusions || 0;
  const industry = base.industry || 'Other';
  
  // TMPS calculation
  const tmps = tmpsInclusions - tmpsExclusions;
  
  // Margin calculation
  const currentMargin = totalRevenue > 0 ? (npat / totalRevenue) * 100 : 0;
  
  // Deemed NPAT calculation
  const industryNorm = INDUSTRY_NORMS[industry] || 6;
  const quarterThreshold = industryNorm / 4;
  const isBelowQuarter = currentMargin < quarterThreshold;
  const deemedNpat = isBelowQuarter 
    ? totalRevenue * (industryNorm / 100) 
    : npat;
  const deemedNpatUsed = isBelowQuarter;
  
  return {
    totalRevenue,
    npat,
    leviableAmount,
    totalPayroll,
    tmpsInclusions,
    tmpsExclusions,
    industry,
    tmps,
    currentMargin,
    quarterThreshold,
    isBelowQuarter,
    deemedNpat,
    deemedNpatUsed,
  };
}

export function FinancialsForm({ data, onChange, className, readOnly }: FinancialsFormProps) {
  const updateField = <K extends keyof FinancialsData>(field: K, value: FinancialsData[K]) => {
    const updated = calculateFinancials({ ...data, [field]: value });
    onChange(updated);
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Core Financials */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <DollarSign className="h-5 w-5 text-primary" />
            Core Financials
          </CardTitle>
          <CardDescription>
            Primary financial drivers for B-BBEE calculations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="totalRevenue">Total Revenue (R) *</Label>
              <Input
                id="totalRevenue"
                type="number"
                value={data.totalRevenue || ''}
                onChange={(e) => updateField('totalRevenue', Number(e.target.value))}
                placeholder="0"
                disabled={readOnly}
              />
              <p className="text-xs text-muted-foreground">
                Annual total revenue before expenses
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="npat">NPAT (R) *</Label>
              <Input
                id="npat"
                type="number"
                value={data.npat || ''}
                onChange={(e) => updateField('npat', Number(e.target.value))}
                placeholder="0"
                disabled={readOnly}
              />
              <p className="text-xs text-muted-foreground">
                Net Profit After Tax
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="leviableAmount">Leviable Amount (R) *</Label>
              <Input
                id="leviableAmount"
                type="number"
                value={data.leviableAmount || ''}
                onChange={(e) => updateField('leviableAmount', Number(e.target.value))}
                placeholder="0"
                disabled={readOnly}
              />
              <p className="text-xs text-muted-foreground">
                Skills levy base (usually 80% of payroll)
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="totalPayroll">Total Payroll (Optional cross-check)</Label>
            <Input
              id="totalPayroll"
              type="number"
              value={data.totalPayroll || ''}
              onChange={(e) => updateField('totalPayroll', Number(e.target.value))}
              placeholder="0"
              disabled={readOnly}
            />
          </div>
        </CardContent>
      </Card>

      {/* TMPS Calculation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calculator className="h-5 w-5 text-primary" />
            Total Measured Procurement Spend (TMPS)
          </CardTitle>
          <CardDescription>
            Base for all procurement and supplier development targets
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tmpsInclusions">TMPS Inclusions (R) *</Label>
              <Input
                id="tmpsInclusions"
                type="number"
                value={data.tmpsInclusions || ''}
                onChange={(e) => updateField('tmpsInclusions', Number(e.target.value))}
                placeholder="0"
                disabled={readOnly}
              />
              <p className="text-xs text-muted-foreground">
                Total procurement spend including capital, depreciation, etc.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tmpsExclusions">TMPS Exclusions (R) *</Label>
              <Input
                id="tmpsExclusions"
                type="number"
                value={data.tmpsExclusions || ''}
                onChange={(e) => updateField('tmpsExclusions', Number(e.target.value))}
                placeholder="0"
                disabled={readOnly}
              />
              <p className="text-xs text-muted-foreground">
                Payments to non-SA residents, public entities, etc.
              </p>
            </div>
          </div>

          <div className="p-4 bg-muted rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Calculated TMPS:</span>
              <span className="text-lg font-bold text-primary">
                R {data.tmps.toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Inclusions - Exclusions = TMPS
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Deemed NPAT Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5 text-primary" />
            Deemed NPAT Check
          </CardTitle>
          <CardDescription>
            Industry norm comparison for companies with low margins
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="industry">Industry *</Label>
              <Select
                value={data.industry}
                onValueChange={(v) => updateField('industry', v)}
                disabled={readOnly}
              >
                <SelectTrigger id="industry">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(INDUSTRY_NORMS).map((industry) => (
                    <SelectItem key={industry} value={industry}>{industry}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Industry Norm</Label>
              <div className="p-2 bg-muted rounded text-sm">
                {INDUSTRY_NORMS[data.industry] || 6}% NPAT margin expected
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-3 bg-muted rounded-lg">
              <span className="text-xs text-muted-foreground">Current Margin</span>
              <p className="text-lg font-semibold">{data.currentMargin.toFixed(2)}%</p>
              <p className="text-xs text-muted-foreground">(NPAT / Revenue) × 100</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <span className="text-xs text-muted-foreground">Quarter Threshold</span>
              <p className="text-lg font-semibold">{data.quarterThreshold.toFixed(2)}%</p>
              <p className="text-xs text-muted-foreground">({(INDUSTRY_NORMS[data.industry] || 6) / 4}% of norm)</p>
            </div>
            <div className={cn(
              "p-3 rounded-lg",
              data.isBelowQuarter ? "bg-amber-50 border border-amber-200" : "bg-muted"
            )}>
              <span className="text-xs text-muted-foreground">Deemed NPAT</span>
              <p className="text-lg font-semibold">
                {data.isBelowQuarter ? (
                  <span className="text-amber-700">R {data.deemedNpat.toLocaleString()}</span>
                ) : (
                  <span>Not Applied</span>
                )}
              </p>
              {data.isBelowQuarter && (
                <p className="text-xs text-amber-600 mt-1">
                  Your margin is below threshold. Deemed NPAT applies.
                </p>
              )}
            </div>
          </div>

          {data.isBelowQuarter && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-amber-800">Deemed NPAT Applied</h4>
                  <p className="text-sm text-amber-700 mt-1">
                    Your current margin ({data.currentMargin.toFixed(2)}%) is below the quarter threshold 
                    ({data.quarterThreshold.toFixed(2)}%). The system will use the deemed NPAT of 
                    R {data.deemedNpat.toLocaleString()} for SED and ESD calculations instead of your actual NPAT.
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      <Card className="bg-primary/5 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Info className="h-5 w-5 text-primary" />
            Financial Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Revenue</p>
              <p className="text-lg font-bold">R {(data.totalRevenue / 1000000).toFixed(1)}M</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">NPAT</p>
              <p className="text-lg font-bold">R {(data.npat / 1000000).toFixed(1)}M</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Leviable Amount</p>
              <p className="text-lg font-bold">R {(data.leviableAmount / 1000000).toFixed(1)}M</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">TMPS</p>
              <p className="text-lg font-bold">R {(data.tmps / 1000000).toFixed(1)}M</p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-primary/10 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <ArrowRight className="h-4 w-4" />
              These values drive: SED (1% of NPAT), ESD SD (2% of NPAT), ESD ED (1% of NPAT), 
              Skills (% of leviable), Procurement (% of TMPS)
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default FinancialsForm;

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@toolkit/components/ui/card";
import { Button } from "@toolkit/components/ui/button";
import { Badge } from "@toolkit/components/ui/badge";
import { Progress } from "@toolkit/components/ui/progress";
import { ScrollArea } from "@toolkit/components/ui/scroll-area";
import { Switch } from "@toolkit/components/ui/switch";
import { Label } from "@toolkit/components/ui/label";
import {
  Users, Building2, GraduationCap, ShoppingCart, Handshake, Heart,
  TrendingUp, Briefcase, CheckCircle2, AlertCircle, ChevronLeft, ArrowRight,
} from "lucide-react";
import { cn } from "@toolkit/lib/utils";

import type {
  OwnershipData, ManagementData, SkillsData, YESData,
  ProcurementData, ESDData, SEDData,
} from "@toolkit/lib/types";

import { calculateOwnershipScore } from "@toolkit/lib/calculators/ownership";
import { calculateManagementScore } from "@toolkit/lib/calculators/management";
import { calculateSkillsScore } from "@toolkit/lib/calculators/skills";
import { calculateYESScore } from "@toolkit/lib/calculators/yes";
import { calculateProcurementScore } from "@toolkit/lib/calculators/procurement";
import { calculateEsdScore, calculateSedScore } from "@toolkit/lib/calculators/esd-sed";

import { OwnershipForm, ManagementForm, SkillsForm, ProcurementForm, ESDForm, SEDForm, YESForm } from "./pillar-forms";
import { useFoundationSync, mergeYesIntoSkills, inferEapProvinceFromAddress } from "@/lib/foundationApi";
import type { ClientInformationData } from "./ClientInformationForm";
import type { FinancialsData } from "./FinancialsForm";
import { AutoFillButton, type AutoFillTarget } from "@/components/AutoFillButton";
import { getLakeTradingPillarData } from "@/lib/lakeTradingDemo";
import { useBbeeStore } from "@toolkit/lib/store";

// ============================================================================
// Pillar config
// ============================================================================

interface PillarConfig {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: React.ElementType;
  maxPoints: number;
  hasSubMinimum: boolean;
  subMinimumThreshold: number;
  /** If false, score is not added to header total (RCOGP Generic: EE mirrors MC). */
  includeInGrandTotal: boolean;
}

// Default pillar config (used when calculatorConfig not loaded yet)
const DEFAULT_PILLARS: PillarConfig[] = [
  { id: 'ownership',              code: 'OWN',    name: 'Ownership',                    description: 'Voting rights, economic interest, net value',     icon: Building2,     maxPoints: 25, hasSubMinimum: true,  subMinimumThreshold: 40,  includeInGrandTotal: true },
  { id: 'management',             code: 'MC+EE',  name: 'Management Control & Employment Equity', description: 'Board, executive, EAP senior/middle/junior, EE levels', icon: Briefcase,     maxPoints: 19, hasSubMinimum: false, subMinimumThreshold: 0,   includeInGrandTotal: true },
  { id: 'skills',                 code: 'SKILLS', name: 'Skills Development',           description: 'Training spend, bursaries, LAI, absorption',        icon: GraduationCap, maxPoints: 25, hasSubMinimum: true,  subMinimumThreshold: 40,  includeInGrandTotal: true },
  { id: 'procurement',            code: 'PROC',   name: 'Preferential Procurement',     description: 'TMPS-based BEE procurement',                     icon: ShoppingCart,  maxPoints: 29, hasSubMinimum: true,  subMinimumThreshold: 40,  includeInGrandTotal: true },
  { id: 'supplierDevelopment',    code: 'SD',     name: 'Supplier Development',         description: 'SD contributions (2% NPAT target, max 10)',       icon: Handshake,     maxPoints: 10, hasSubMinimum: true,  subMinimumThreshold: 40,  includeInGrandTotal: true },
  { id: 'enterpriseDevelopment',  code: 'ED',     name: 'Enterprise Development',       description: 'ED contributions (1% NPAT + bonuses, max 7)',     icon: Handshake,     maxPoints: 7,  hasSubMinimum: false, subMinimumThreshold: 0,   includeInGrandTotal: true },
  { id: 'sed',                    code: 'SED',    name: 'Socio-Economic Development',   description: 'SED as % of NPAT',                                icon: Heart,         maxPoints: 5,  hasSubMinimum: false, subMinimumThreshold: 0,   includeInGrandTotal: true },
  { id: 'yes',                    code: 'YES',    name: 'YES Initiative',               description: 'Youth placement tiers (included in scorecard total)', icon: TrendingUp, maxPoints: 3,  hasSubMinimum: false, subMinimumThreshold: 0,   includeInGrandTotal: true },
];

// Map calculatorConfig pillar codes to UI metadata
const PILLAR_METADATA: Record<string, { name: string; description: string; icon: typeof Building2 }> = {
  ownership: { name: 'Ownership', description: 'Voting rights, economic interest, net value', icon: Building2 },
  managementControl: { name: 'Management Control & Employment Equity', description: 'Board, executive, EAP levels', icon: Briefcase },
  employmentEquity: { name: 'Employment Equity', description: 'Senior, middle, junior EE targets', icon: Users },
  skillsDevelopment: { name: 'Skills Development', description: 'Training spend, bursaries, LAI, absorption', icon: GraduationCap },
  preferentialProcurement: { name: 'Preferential Procurement', description: 'TMPS-based BEE procurement', icon: ShoppingCart },
  supplierDevelopment: { name: 'Supplier Development', description: 'SD contributions (NPAT % target)', icon: Handshake },
  enterpriseDevelopment: { name: 'Enterprise Development', description: 'ED contributions (NPAT % + bonuses)', icon: Handshake },
  socioEconomicDevelopment: { name: 'Socio-Economic Development', description: 'SED as % of NPAT', icon: Heart },
  yesInitiative: { name: 'YES Initiative', description: 'Youth placement tiers', icon: TrendingUp },
  empowermentFinancing: { name: 'Empowerment Financing', description: 'FSC-specific financing', icon: Building2 },
  accessToFinancialServices: { name: 'Access to Financial Services', description: 'FSC-specific access', icon: Users },
};

// Normalize API pillar keys to short IDs used by renderPillarForm/hasData/getPillarScore
const PILLAR_ID_MAP: Record<string, string> = {
  managementControl: 'management',
  skillsDevelopment: 'skills',
  preferentialProcurement: 'procurement',
  socioEconomicDevelopment: 'sed',
  yesInitiative: 'yes',
  // These already match:
  ownership: 'ownership',
  supplierDevelopment: 'supplierDevelopment',
  enterpriseDevelopment: 'enterpriseDevelopment',
};

// Generate dynamic pillar config from calculatorConfig
function usePillarConfig(): PillarConfig[] {
  const calculatorConfig = useBbeeStore(state => state.calculatorConfig);

  if (!calculatorConfig?.pillarConfigs) {
    return DEFAULT_PILLARS;
  }

  const pc = calculatorConfig.pillarConfigs;
  const pillars: PillarConfig[] = [];
  let displayOrder = 0;

  // Build pillars dynamically from calculatorConfig.pillarConfigs
  for (const [key, config] of Object.entries(pc)) {
    if (!config || config.maxPoints === 0) continue; // Skip empty/zero pillars

    const meta = PILLAR_METADATA[key] || { name: key, description: '', icon: Building2 };
    const shortId = PILLAR_ID_MAP[key] || key;

    pillars.push({
      id: shortId,
      code: key.substring(0, 4).toUpperCase(),
      name: meta.name,
      description: meta.description,
      icon: meta.icon,
      maxPoints: config.maxPoints,
      hasSubMinimum: config.hasSubMinimum ?? false,
      subMinimumThreshold: config.subMinimumPercent ?? 0,
      includeInGrandTotal: true,
    });

    displayOrder++;
  }

  return pillars.length > 0 ? pillars : DEFAULT_PILLARS;
}

// ============================================================================
// Types
// ============================================================================

// Issue 1: employmentEquity removed from BuildPillarsData (merged with management)
export interface BuildPillarsData {
  ownership: OwnershipData;
  management: ManagementData;
  skills: SkillsData;
  yes: YESData;
  procurement: ProcurementData;
  esd: ESDData;
  sed: SEDData;
}

interface PillarStatus {
  isComplete: boolean;
  score: number;
  maxPoints: number;
}

interface BuildPillarsStepProps {
  data: BuildPillarsData;
  onChange: (data: BuildPillarsData) => void;
  onNext: () => void;
  onBack: () => void;
  className?: string;
  sessionId: string;
  clientInfo?: ClientInformationData;
  financials?: FinancialsData;
}

// ============================================================================
// Component
// ============================================================================

export function BuildPillarsStep({
  data, onChange, onNext, onBack, className, sessionId, clientInfo, financials
}: BuildPillarsStepProps) {
  const [activePillar, setActivePillar] = useState<string>('ownership');
  const { syncToStore } = useFoundationSync(sessionId);
  const PILLARS = usePillarConfig();

  useEffect(() => {
    if (clientInfo && financials) {
      syncToStore({ clientInfo, financials });
    }
  }, [clientInfo, financials, syncToStore]);

  const npatForEsd = financials?.deemedNpatUsed
    ? (financials.deemedNpat ?? financials.npat ?? 0)
    : (financials?.npat ?? 0);

  const eapProvince = clientInfo?.eapProvince
    ?? inferEapProvinceFromAddress(clientInfo?.physicalAddress ?? '');

  const leviable = financials?.leviableAmount || data.skills.leviableAmount || 0;

  const calculatorConfig = useBbeeStore(state => state.calculatorConfig);
  const ignoreSubMinimum = useBbeeStore(state => state.ignoreSubMinimum);
  const setIgnoreSubMinimum = useBbeeStore(state => state.setIgnoreSubMinimum);

  const emptyEsd = { total: 0, sdTotal: 0, edTotal: 0, supplierDev: 0, enterpriseDev: 0, graduationBonus: 0, jobsCreatedBonus: 0, sdSubMinimumMet: false, edSubMinimumMet: false, subMinimumMet: false, sdSpend: 0, edSpend: 0, sdTarget: 0, edTarget: 0, sdSubLines: [] as any[], edSubLines: [] as any[], subLines: [] as any[] };
  const esdLive = useMemo(
    () => calculatorConfig ? calculateEsdScore(data.esd, npatForEsd, calculatorConfig) : emptyEsd,
    [data.esd, npatForEsd, calculatorConfig],
  );
  const procLive = useMemo(
    () => calculatorConfig ? calculateProcurementScore(data.procurement, calculatorConfig) : { total: 0, subMinimumMet: false, subLines: [] as any[], recognisedSpend: 0, target: 0, base: 0, empoweringSuppliers: 0, qseSuppliers: 0, emeSuppliers: 0, blackOwned51: 0, blackFemaleOwned30: 0, designatedGroup: 0, rawStats: {} as any },
    [data.procurement, calculatorConfig],
  );
  const skillsLive = useMemo(
    () => calculatorConfig ? calculateSkillsScore({ ...data.skills, leviableAmount: leviable }, calculatorConfig) : { total: 0, subMinimumMet: false, learningProgrammes: 0, bursaries: 0, disabledLearning: 0, learnerships: 0, absorption: 0, categoryBreakdown: [] as any[], subLines: [] as any[], rawStats: {} as any },
    [data.skills, leviable, calculatorConfig],
  );

    // Issue 1: Removed employmentEquity from pillar scores (merged with management)
    const pillarScores = useMemo(() => {
    const merged = mergeYesIntoSkills(data.skills, data.yes);
    const candidates = (merged.trainingPrograms || [])
      .filter(p => p.isYesEmployee)
      .map(p => ({
        id: p.id,
        name: p.learnerName || 'YES',
        race: p.race,
        gender: p.gender,
        isDisabled: p.isDisabled ?? false,
        isBlack: (p as { isBlack?: boolean }).isBlack ?? p.race !== 'White',
        startDate: p.startDate || p.transactionDate || new Date().toISOString().slice(0, 10),
        isAbsorbed: p.isAbsorbed ?? false,
        cost: (p as { cost?: number }).cost ?? p.courseCost ?? 0,
      }));
    const y: YESData = {
      ...data.yes,
      totalEmployees: data.management.employees?.length ?? 0,
      candidates,
      yesYouthEnrolled: candidates.length,
      totalYesCost: candidates.reduce((s, c) => s + c.cost, 0),
    };
    let yesPts = 0;
    try {
      if (calculatorConfig) yesPts = calculateYESScore(y, calculatorConfig).score;
    } catch { /* ignore */ }
    if (!calculatorConfig) {
      return { ownership: 0, management: 0, skills: 0, procurement: 0, supplierDevelopment: 0, enterpriseDevelopment: 0, sed: 0, yes: 0 };
    }
    return {
      ownership: calculateOwnershipScore(data.ownership, calculatorConfig).total,
      management: calculateManagementScore(data.management, calculatorConfig, eapProvince).total,
      skills: skillsLive.total,
      procurement: procLive.total,
      supplierDevelopment: esdLive.sdTotal,
      enterpriseDevelopment: esdLive.edTotal,
      sed: calculateSedScore(data.sed, npatForEsd, calculatorConfig).total,
      yes: yesPts,
    };
  }, [data, eapProvince, skillsLive, procLive, esdLive, npatForEsd]);

  const getPillarScore = useCallback(
    (id: string): number => (pillarScores as Record<string, number>)[id] ?? 0,
    [pillarScores],
  );

  const hasData = useCallback((id: string): boolean => {
    switch (id) {
      case 'ownership':               return data.ownership.shareholders.length > 0;
      case 'management':              return data.management.employees.length > 0;
      // Issue 1: employmentEquity case removed (merged with management)
      case 'skills':                  return data.skills.trainingPrograms.length > 0;
      case 'procurement':             return data.procurement.suppliers.length > 0 || data.procurement.tmps > 0;
      case 'supplierDevelopment':     return data.esd.contributions.some(c => c.category === 'supplier_development');
      case 'enterpriseDevelopment':   return data.esd.contributions.some(c => c.category === 'enterprise_development');
      case 'sed':                     return data.sed.contributions.length > 0;
      case 'yes':
        return data.yes.candidates.length > 0
          || (data.skills.trainingPrograms || []).some(p => p.isYesEmployee);
      default:                        return false;
    }
  }, [data]);

  const completedCount = PILLARS.filter(p => hasData(p.id)).length;
  const completionPct = Math.round((completedCount / PILLARS.length) * 100);
  const totalScore = PILLARS.filter(p => p.includeInGrandTotal).reduce((sum, p) => sum + getPillarScore(p.id), 0);

  // Use calculatorConfig.totalMaxPoints (verified Excel value) instead of calculating
  // This handles sector-specific totals correctly (e.g., RCOGP 120, ICT 140, AGRI 132)
  const totalMax = calculatorConfig?.totalMaxPoints ?? PILLARS.reduce((s, p) => s + p.maxPoints, 0);

  // Sub-minimum enforcement gate
  const failedSubMinimums = PILLARS.filter(p => {
    const config = calculatorConfig?.pillarConfigs?.[p.id as keyof typeof calculatorConfig.pillarConfigs];
    const hasSubMin = config && 'subMinimumPercent' in config ? (config.subMinimumPercent ?? 0) > 0 : p.hasSubMinimum;
    if (!hasSubMin || !hasData(p.id)) return false;
    const score = getPillarScore(p.id);
    // Check against dynamic threshold from calculatorConfig
    const configThreshold = config && 'subMinimumPercent' in config && config.subMinimumPercent !== undefined
      ? (config.subMinimumPercent / 100) * (config.maxPoints ?? p.maxPoints)
      : undefined;
    const threshold = configThreshold ?? (p.subMinimumThreshold / 100) * p.maxPoints;
    return score < threshold;
  }).map(p => p.name);
  const hasFailedSubMinimums = failedSubMinimums.length > 0;

  const activePillarConfig = PILLARS.find(p => p.id === activePillar) || PILLARS[0];

  // Auto-fill handler - receives optionId to know exactly what was filled
  // Issue 1: Removed employmentEquity from management autofill (merged pillars)
  const handleAutoFill = (filledData: any, optionId: AutoFillTarget) => {
    switch (optionId) {
      case 'all':          onChange(filledData as BuildPillarsData); break;
      case 'ownership':    onChange({ ...data, ownership: filledData }); break;
      case 'management':   onChange({ ...data, management: filledData }); break;
      case 'skills':       onChange({ ...data, skills: filledData }); break;
      case 'procurement':  onChange({ ...data, procurement: filledData }); break;
      case 'esd':          onChange({ ...data, esd: filledData }); break;
      case 'sed':          onChange({ ...data, sed: filledData }); break;
      case 'yes':          onChange({ ...data, yes: filledData }); break;
    }
  };

  const renderPillarForm = () => {
    switch (activePillar) {
      case 'ownership':
        return (
          <OwnershipForm
            data={data.ownership}
            onChange={(d) => onChange({ ...data, ownership: d })}
          />
        );
      case 'management':
        return (
          <ManagementForm
            data={data.management}
            onChange={(d) => onChange({ ...data, management: d })}
            eapProvince={eapProvince}
          />
        );
      // Issue 1: employmentEquity case removed (merged with management)
      case 'skills':
        return (
          <SkillsForm
            data={data.skills}
            onChange={(d) => onChange({ ...data, skills: d })}
            npat={npatForEsd}
          />
        );
      case 'procurement':
        return (
          <ProcurementForm
            data={data.procurement}
            onChange={(d) => onChange({ ...data, procurement: d })}
          />
        );
      case 'supplierDevelopment':
      case 'enterpriseDevelopment':
      case 'esd':
        return (
          <ESDForm
            data={data.esd}
            onChange={(d) => onChange({ ...data, esd: d })}
            npat={npatForEsd}
          />
        );
      case 'sed':
        return (
          <SEDForm
            data={data.sed}
            onChange={(d) => onChange({ ...data, sed: d })}
            npat={npatForEsd}
          />
        );
      case 'yes':
        return (
          <YESForm
            data={data.yes}
            onChange={(d) => onChange({ ...data, yes: d })}
            totalEmployees={data.management.employees.length || undefined}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Pillar Data Entry</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Enter data for each B-BBEE pillar to build your scorecard
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums">{totalScore.toFixed(1)}</div>
          <div className="text-xs text-muted-foreground">of {totalMax} points</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <Progress value={completionPct} className="flex-1 h-1.5" />
        <span className="text-xs text-muted-foreground shrink-0">
          {completedCount}/{PILLARS.length} pillars with data
        </span>
      </div>

      {/* Main layout: sidebar + form */}
      <div className="grid grid-cols-[minmax(260px,280px)_1fr] gap-4" style={{ minHeight: 600 }}>

        {/* Sidebar */}
        <div className="border border-border/60 rounded-lg overflow-hidden bg-transparent min-w-[260px]">
          <ScrollArea className="h-full">
            <div className="p-2 space-y-0.5">
              {PILLARS.map((p) => {
                const Icon = p.icon;
                const score = getPillarScore(p.id);
                const active = activePillar === p.id;
                const filled = hasData(p.id);
                let subMinRisk = false;
                if (filled) {
                  if (p.id === 'procurement') subMinRisk = !procLive.subMinimumMet;
                  else if (p.id === 'skills') subMinRisk = !skillsLive.subMinimumMet;
                  else if (p.id === 'supplierDevelopment') subMinRisk = !esdLive.sdSubMinimumMet;
                  else if (p.id === 'enterpriseDevelopment') subMinRisk = !esdLive.edSubMinimumMet;
                  else if (p.hasSubMinimum) subMinRisk = score < p.subMinimumThreshold;
                }

                return (
                  <button
                    key={p.id}
                    onClick={() => setActivePillar(p.id)}
                    className={cn(
                      "w-full px-3 py-2.5 rounded-md text-left transition-colors border border-transparent",
                      active ? "bg-muted/80 text-foreground border-border/50" : "hover:bg-muted/40"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={cn("h-4 w-4 shrink-0 text-muted-foreground")} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1">
                          <span className="text-xs font-medium leading-tight text-foreground [overflow-wrap:anywhere]">
                            {p.name}
                          </span>
                          {filled && !active && <CheckCircle2 className="h-3 w-3 text-muted-foreground shrink-0" />}
                          {subMinRisk && <AlertCircle className="h-3 w-3 text-amber-600/90 shrink-0" />}
                        </div>
                        <div className="text-[10px] mt-0.5 tabular-nums text-muted-foreground">
                          {score.toFixed(1)} / {p.maxPoints} pts
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Form area */}
        <div className="border border-border/60 rounded-lg bg-transparent flex flex-col overflow-hidden">
          {/* Pillar header */}
          <div className="px-5 py-4 border-b flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <activePillarConfig.icon className="h-5 w-5 text-muted-foreground" />
              <div>
                <h3 className="font-semibold text-sm">{activePillarConfig.name}</h3>
                <p className="text-xs text-muted-foreground">{activePillarConfig.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs tabular-nums">
                {getPillarScore(activePillar).toFixed(1)} / {activePillarConfig.maxPoints}
              </Badge>
              {activePillar === 'procurement' && (
                <Badge variant={procLive.subMinimumMet ? "outline" : "secondary"} className="text-xs">
                  sub-min: 11.6
                </Badge>
              )}
              {activePillar === 'skills' && (
                <Badge variant={skillsLive.subMinimumMet ? "outline" : "secondary"} className="text-xs">
                  sub-min: 10
                </Badge>
              )}
              {activePillar === 'supplierDevelopment' && (
                <Badge variant={esdLive.sdSubMinimumMet ? "outline" : "secondary"} className="text-xs">
                  sub-min: 4
                </Badge>
              )}
              {activePillar === 'enterpriseDevelopment' && (
                <Badge variant={esdLive.edSubMinimumMet ? "outline" : "secondary"} className="text-xs">
                  sub-min: 2 (base ED)
                </Badge>
              )}
              {activePillarConfig.hasSubMinimum &&
                !['procurement', 'skills', 'supplierDevelopment', 'enterpriseDevelopment'].includes(activePillar) && (
                <Badge
                  variant={getPillarScore(activePillar) >= activePillarConfig.subMinimumThreshold ? "outline" : "secondary"}
                  className="text-xs"
                >
                  sub-min: {activePillarConfig.subMinimumThreshold}
                </Badge>
              )}
            </div>
          </div>

          {/* Scrollable form content */}
          <ScrollArea className="flex-1">
            <div className="p-5">
              {renderPillarForm()}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Sub-minimum enforcement warning */}
      {hasFailedSubMinimums && !ignoreSubMinimum && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-red-800">Sub-minimum requirements not met</p>
              <p className="text-red-700">
                The following pillars have not met their sub-minimum thresholds:
                {' '}{failedSubMinimums.join(', ')}.
                You cannot calculate the scorecard until all sub-minimums are met.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2 border-t">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ChevronLeft className="h-4 w-4" />
          Back to Foundation
        </Button>
        <div className="flex items-center gap-4">
          {/* Toggle to calculate without sub-minimum */}
          <div className="flex items-center gap-2">
            <Switch
              id="ignore-subminimum"
              checked={ignoreSubMinimum}
              onCheckedChange={setIgnoreSubMinimum}
            />
            <Label htmlFor="ignore-subminimum" className="text-sm text-muted-foreground cursor-pointer">
              Calculate without sub-minimum
            </Label>
          </div>
          <Button
            onClick={onNext}
            disabled={completedCount === 0 || (hasFailedSubMinimums && !ignoreSubMinimum)}
            className="gap-2"
            title={hasFailedSubMinimums && !ignoreSubMinimum ? 'Sub-minimum requirements not met' : ''}
          >
            Calculate Scorecard
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Auto-fill */}
      <AutoFillButton
        target={
          activePillar === 'supplierDevelopment' || activePillar === 'enterpriseDevelopment'
            ? 'esd'
            : activePillar === 'employmentEquity'
              ? 'management'
              : (activePillar as AutoFillTarget)
        }
        onFill={handleAutoFill}
      />
    </div>
  );
}

export default BuildPillarsStep;

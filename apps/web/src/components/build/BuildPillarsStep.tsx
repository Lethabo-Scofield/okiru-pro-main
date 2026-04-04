import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@toolkit/components/ui/card";
import { Button } from "@toolkit/components/ui/button";
import { Badge } from "@toolkit/components/ui/badge";
import { Progress } from "@toolkit/components/ui/progress";
import { ScrollArea } from "@toolkit/components/ui/scroll-area";
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

// Issue 1: Management Control & Employment Equity combined into one pillar
const PILLARS: PillarConfig[] = [
  { id: 'ownership',              code: 'OWN',    name: 'Ownership',                    description: 'Voting rights, economic interest, net value',     icon: Building2,     maxPoints: 25, hasSubMinimum: true,  subMinimumThreshold: 10,  includeInGrandTotal: true },
  { id: 'management',             code: 'MC+EE',  name: 'Management Control & Employment Equity', description: 'Board, executive, EAP senior/middle/junior, EE levels', icon: Briefcase,     maxPoints: 19, hasSubMinimum: false, subMinimumThreshold: 0,   includeInGrandTotal: true },
  // Issue 1: employmentEquity pillar removed (merged with management)
  { id: 'skills',                 code: 'SKILLS', name: 'Skills Development',           description: 'Training spend, bursaries, LAI, absorption',        icon: GraduationCap, maxPoints: 25, hasSubMinimum: true,  subMinimumThreshold: 10,  includeInGrandTotal: true },
  { id: 'procurement',            code: 'PROC',   name: 'Preferential Procurement',     description: 'TMPS-based BEE procurement',                     icon: ShoppingCart,  maxPoints: 29, hasSubMinimum: true,  subMinimumThreshold: 11.6, includeInGrandTotal: true },
  { id: 'supplierDevelopment',    code: 'SD',     name: 'Supplier Development',         description: 'SD contributions (2% NPAT target, max 10)',       icon: Handshake,     maxPoints: 10, hasSubMinimum: true,  subMinimumThreshold: 4,   includeInGrandTotal: true },
  { id: 'enterpriseDevelopment',  code: 'ED',     name: 'Enterprise Development',       description: 'ED contributions (1% NPAT + bonuses, max 7)',     icon: Handshake,     maxPoints: 7,  hasSubMinimum: true,  subMinimumThreshold: 2,   includeInGrandTotal: true },
  { id: 'sed',                    code: 'SED',    name: 'Socio-Economic Development',   description: 'SED as % of NPAT',                                icon: Heart,         maxPoints: 5,  hasSubMinimum: false, subMinimumThreshold: 0,   includeInGrandTotal: true },
  { id: 'yes',                    code: 'YES',    name: 'YES Initiative',               description: 'Youth placement tiers (included in scorecard total)', icon: TrendingUp, maxPoints: 3,  hasSubMinimum: false, subMinimumThreshold: 0,   includeInGrandTotal: true },
];

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

  const esdLive = useMemo(
    () => calculateEsdScore(data.esd, npatForEsd),
    [data.esd, npatForEsd],
  );
  const procLive = useMemo(() => calculateProcurementScore(data.procurement), [data.procurement]);
  const skillsLive = useMemo(
    () => calculateSkillsScore({ ...data.skills, leviableAmount: leviable }),
    [data.skills, leviable],
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
      yesPts = calculateYESScore(y).score;
    } catch { /* ignore */ }
    return {
      ownership: calculateOwnershipScore(data.ownership).total,
      management: calculateManagementScore(data.management, undefined, eapProvince).total,
      // Issue 1: employmentEquity removed (merged with management)
      skills: skillsLive.total,
      procurement: procLive.total,
      supplierDevelopment: esdLive.sdTotal,
      enterpriseDevelopment: esdLive.edTotal,
      sed: calculateSedScore(data.sed, npatForEsd).total,
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
  /** Core RCOGP Generic = 120; YES tier points count in numerator only (aligned with scorecard /120). */
  const totalMax = PILLARS.filter(p => p.includeInGrandTotal && p.id !== 'yes').reduce((s, p) => s + p.maxPoints, 0);

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
      <div className="grid grid-cols-[220px_1fr] gap-4" style={{ minHeight: 600 }}>

        {/* Sidebar */}
        <div className="border border-border/60 rounded-lg overflow-hidden bg-transparent">
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
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-medium truncate text-foreground">
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

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2 border-t">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ChevronLeft className="h-4 w-4" />
          Back to Foundation
        </Button>
        <Button onClick={onNext} disabled={completedCount === 0} className="gap-2">
          Calculate Scorecard
          <ArrowRight className="h-4 w-4" />
        </Button>
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

import React, { useState, useCallback, useEffect } from 'react';
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
  ProcurementData, ESDData, SEDData, ScorecardResult
} from "@toolkit/lib/types";

import { calculateOwnershipScore } from "@toolkit/lib/calculators/ownership";
import { calculateManagementScore } from "@toolkit/lib/calculators/management";
import { calculateSkillsScore } from "@toolkit/lib/calculators/skills";
import { calculateYESScore } from "@toolkit/lib/calculators/yes";
import { calculateProcurementScore } from "@toolkit/lib/calculators/procurement";
import { calculateEsdScore, calculateSedScore } from "@toolkit/lib/calculators/esd-sed";

import { OwnershipForm, ManagementForm, SkillsForm, ProcurementForm, ESDForm, SEDForm, YESForm } from "./pillar-forms";
import { useFoundationSync } from "@/lib/foundationApi";
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
}

const PILLARS: PillarConfig[] = [
  { id: 'ownership',        code: 'OWN',   name: 'Ownership',                  description: 'Voting rights, economic interest, net value',      icon: Building2,    maxPoints: 25, hasSubMinimum: true,  subMinimumThreshold: 10 },
  { id: 'management',       code: 'MC',    name: 'Management Control',          description: 'Board, executive, senior, middle, junior levels',  icon: Briefcase,    maxPoints: 19, hasSubMinimum: false, subMinimumThreshold: 0 },
  { id: 'employmentEquity', code: 'EE',    name: 'Employment Equity',           description: 'EAP targets per occupational level',               icon: Users,        maxPoints: 11, hasSubMinimum: false, subMinimumThreshold: 0 },
  { id: 'skills',           code: 'SKILLS',name: 'Skills Development',          description: 'Training spend, categories A-F, bursaries',       icon: GraduationCap,maxPoints: 25, hasSubMinimum: true,  subMinimumThreshold: 15 },
  { id: 'procurement',      code: 'PROC',  name: 'Preferential Procurement',    description: 'BEE-weighted spend, empowering suppliers',         icon: ShoppingCart, maxPoints: 27, hasSubMinimum: true,  subMinimumThreshold: 16 },
  { id: 'esd',              code: 'ESD',   name: 'Enterprise & Supplier Dev',   description: 'SD and ED contributions as % of NPAT',             icon: Handshake,    maxPoints: 15, hasSubMinimum: false, subMinimumThreshold: 0 },
  { id: 'sed',              code: 'SED',   name: 'Socio-Economic Development',  description: 'SED contributions as % of NPAT',                   icon: Heart,        maxPoints: 5,  hasSubMinimum: false, subMinimumThreshold: 0 },
  { id: 'yes',              code: 'YES',   name: 'YES Initiative',              description: 'Youth employment, absorption, BEE level uplift',   icon: TrendingUp,   maxPoints: 5,  hasSubMinimum: false, subMinimumThreshold: 0 },
];

// ============================================================================
// Types
// ============================================================================

export interface BuildPillarsData {
  ownership: OwnershipData;
  management: ManagementData;
  employmentEquity: ManagementData;
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

  const npat = financials?.npat ?? 0;

  // Live score per pillar
  const getPillarScore = useCallback((id: string): number => {
    try {
      switch (id) {
        case 'ownership':        return calculateOwnershipScore(data.ownership).total;
        case 'management':       return calculateManagementScore(data.management).total;
        case 'employmentEquity': return calculateManagementScore(data.employmentEquity).total;
        case 'skills':           return calculateSkillsScore({ ...data.skills, leviableAmount: financials?.leviableAmount || data.skills.leviableAmount || 0 }).total;
        case 'procurement':      return calculateProcurementScore(data.procurement).total;
        case 'esd':              return calculateEsdScore(data.esd, npat).total;
        case 'sed':              return calculateSedScore(data.sed, npat).total;
        case 'yes':              return calculateYESScore(data.yes).yesBeeLevelIncrease;
        default:                 return 0;
      }
    } catch { return 0; }
  }, [data, financials, npat]);

  const hasData = useCallback((id: string): boolean => {
    switch (id) {
      case 'ownership':        return data.ownership.shareholders.length > 0;
      case 'management':       return data.management.employees.length > 0;
      case 'employmentEquity': return data.employmentEquity.employees.length > 0;
      case 'skills':           return data.skills.trainingPrograms.length > 0;
      case 'procurement':      return data.procurement.suppliers.length > 0 || data.procurement.tmps > 0;
      case 'esd':              return data.esd.contributions.length > 0;
      case 'sed':              return data.sed.contributions.length > 0;
      case 'yes':              return data.yes.candidates.length > 0;
      default:                 return false;
    }
  }, [data]);

  const completedCount = PILLARS.filter(p => hasData(p.id)).length;
  const completionPct = Math.round((completedCount / PILLARS.length) * 100);
  const totalScore = PILLARS.reduce((sum, p) => sum + getPillarScore(p.id), 0);
  const totalMax = PILLARS.reduce((sum, p) => sum + p.maxPoints, 0);

  const activePillarConfig = PILLARS.find(p => p.id === activePillar) || PILLARS[0];

  // Auto-fill handler - receives optionId to know exactly what was filled
  const handleAutoFill = (filledData: any, optionId: AutoFillTarget) => {
    switch (optionId) {
      case 'all':          onChange(filledData as BuildPillarsData); break;
      case 'ownership':    onChange({ ...data, ownership: filledData }); break;
      case 'management':   onChange({ ...data, management: filledData, employmentEquity: filledData }); break;
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
          />
        );
      case 'employmentEquity':
        return (
          <ManagementForm
            data={data.employmentEquity}
            onChange={(d) => onChange({ ...data, employmentEquity: d })}
          />
        );
      case 'skills':
        return (
          <SkillsForm
            data={data.skills}
            onChange={(d) => onChange({ ...data, skills: d })}
            npat={npat}
          />
        );
      case 'procurement':
        return (
          <ProcurementForm
            data={data.procurement}
            onChange={(d) => onChange({ ...data, procurement: d })}
          />
        );
      case 'esd':
        return (
          <ESDForm
            data={data.esd}
            onChange={(d) => onChange({ ...data, esd: d })}
            npat={npat}
          />
        );
      case 'sed':
        return (
          <SEDForm
            data={data.sed}
            onChange={(d) => onChange({ ...data, sed: d })}
            npat={npat}
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
        <div className="border rounded-lg overflow-hidden bg-background">
          <ScrollArea className="h-full">
            <div className="p-2 space-y-0.5">
              {PILLARS.map((p) => {
                const Icon = p.icon;
                const score = getPillarScore(p.id);
                const active = activePillar === p.id;
                const filled = hasData(p.id);
                const subMinRisk = p.hasSubMinimum && filled && score < p.subMinimumThreshold;

                return (
                  <button
                    key={p.id}
                    onClick={() => setActivePillar(p.id)}
                    className={cn(
                      "w-full px-3 py-2.5 rounded-md text-left transition-colors",
                      active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={cn("h-4 w-4 shrink-0", active ? "opacity-90" : "text-muted-foreground")} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className={cn("text-xs font-medium truncate", !active && "text-foreground")}>
                            {p.name}
                          </span>
                          {filled && !active && <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />}
                          {subMinRisk && <AlertCircle className="h-3 w-3 text-amber-500 shrink-0" />}
                        </div>
                        <div className={cn("text-[10px] mt-0.5 tabular-nums", active ? "opacity-75" : "text-muted-foreground")}>
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
        <div className="border rounded-lg bg-background flex flex-col overflow-hidden">
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
              {activePillarConfig.hasSubMinimum && (
                <Badge
                  variant={getPillarScore(activePillar) >= activePillarConfig.subMinimumThreshold ? "outline" : "destructive"}
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
        target={activePillar as AutoFillTarget}
        onFill={handleAutoFill}
      />
    </div>
  );
}

export default BuildPillarsStep;

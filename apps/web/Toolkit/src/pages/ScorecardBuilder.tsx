/**
 * Scorecard Builder Page
 *
 * Main orchestrator for B-BBEE scorecard data entry.
 * Manages pillar navigation, entity values, calculation triggers,
 * and result display. Integrates with the hierarchical entity manifest
 * and calculation engine from Phases 1-3.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useLocation, useSearch } from 'wouter';
import { 
  ChevronLeft, ChevronRight, Calculator, Save, Loader2, 
  CheckCircle2, AlertCircle, Trophy, FileText, Building2,
  TrendingUp, Shield, ArrowRight
} from 'lucide-react';
import { PillarForm } from '@toolkit/components/scorecard-builder/PillarForm';
import { useToast } from '@toolkit/hooks/use-toast';
import type { EntityManifest, PillarPack } from '@api/pipeline/extraction/entityManifest';
import type { ScorecardResult, EntityValue } from '@api/pipeline/rules/calculationEngine';

// ============================================================================
// Types
// ============================================================================

interface BuilderState {
  assessmentId: string;
  sectorCode: string;
  scorecardType: string;
  manifest: EntityManifest | null;
  values: Record<string, unknown>;
  scorecardResult: ScorecardResult | null;
  isLoading: boolean;
  isCalculating: boolean;
  isSaving: boolean;
  activePillarIndex: number;
  pillarValidation: Map<string, boolean>;
}

// ============================================================================
// Pillar Navigation Items
// ============================================================================

const PILLAR_ICONS: Record<string, typeof Building2> = {
  financials: TrendingUp,
  ownership: Building2,
  managementControl: Shield,
  employmentEquity: CheckCircle2,
  skillsDevelopment: TrendingUp,
  preferentialProcurement: FileText,
  enterpriseSupplierDevelopment: Building2,
  socioEconomicDevelopment: CheckCircle2,
  yesInitiative: Trophy,
};

const PILLAR_ORDER = [
  'financials',
  'ownership',
  'managementControl',
  'employmentEquity',
  'skillsDevelopment',
  'preferentialProcurement',
  'enterpriseSupplierDevelopment',
  'socioEconomicDevelopment',
  'yesInitiative',
];

// ============================================================================
// Main Component
// ============================================================================

export default function ScorecardBuilder() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  
  const params = new URLSearchParams(search);
  const clientId = params.get('client');
  const yearEnd = params.get('year');

  const [state, setState] = useState<BuilderState>({
    assessmentId: `assessment-${Date.now()}`,
    sectorCode: params.get('sector') || 'RCOGP',
    scorecardType: params.get('type') || 'Generic',
    manifest: null,
    values: {},
    scorecardResult: null,
    isLoading: true,
    isCalculating: false,
    isSaving: false,
    activePillarIndex: 0,
    pillarValidation: new Map(),
  });

  // Load manifest on mount
  useEffect(() => {
    loadManifest();
  }, [state.sectorCode, state.scorecardType]);

  // Auto-save draft
  useEffect(() => {
    if (Object.keys(state.values).length > 0) {
      const timeout = setTimeout(() => {
        saveDraft();
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [state.values]);

  const loadManifest = async () => {
    try {
      const response = await fetch(
        `/api/manifest?sector=${state.sectorCode}&type=${state.scorecardType}`
      );
      if (!response.ok) throw new Error('Failed to load manifest');
      
      const manifest: EntityManifest = await response.json();
      setState(prev => ({ ...prev, manifest, isLoading: false }));
    } catch (err) {
      toast({
        title: 'Error loading scorecard',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const saveDraft = useCallback(async () => {
    try {
      const draft = {
        assessmentId: state.assessmentId,
        sectorCode: state.sectorCode,
        scorecardType: state.scorecardType,
        values: state.values,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(`scorecard-draft-${state.assessmentId}`, JSON.stringify(draft));
    } catch {
      // Silent fail
    }
  }, [state.assessmentId, state.sectorCode, state.scorecardType, state.values]);

  const handleValueChange = useCallback((entityId: string, value: unknown) => {
    setState(prev => ({
      ...prev,
      values: { ...prev.values, [entityId]: value },
      scorecardResult: null, // Invalidate previous results
    }));
  }, []);

  const handlePillarValidate = useCallback((pillarCode: string, isValid: boolean) => {
    setState(prev => {
      const newValidation = new Map(prev.pillarValidation);
      newValidation.set(pillarCode, isValid);
      return { ...prev, pillarValidation: newValidation };
    });
  }, []);

  const calculateScorecard = useCallback(async () => {
    setState(prev => ({ ...prev, isCalculating: true }));

    try {
      // Convert values to EntityValue format
      const entityValues: Record<string, EntityValue> = {};
      for (const [key, value] of Object.entries(state.values)) {
        if (value !== undefined && value !== null && !Array.isArray(value) && typeof value !== 'object') {
          entityValues[key] = {
            entityId: key,
            value,
            source: 'manual',
          };
        }
      }

      // Extract entity arrays from state values (stored under pillar-specific keys)
      const v = state.values;
      const employees = Array.isArray(v.employees) ? v.employees : undefined;
      const shareholders = Array.isArray(v.shareholders) ? v.shareholders : undefined;
      const suppliers = Array.isArray(v.suppliers) ? v.suppliers : undefined;
      const contributions = Array.isArray(v.contributions) ? v.contributions : undefined;

      // Extract financials from state values
      const financials = (typeof v.revenue === 'number' || typeof v.npat === 'number')
        ? {
            revenue: Number(v.revenue) || 0,
            npat: Number(v.npat) || 0,
            leviableAmount: Number(v.leviable_amount ?? v.leviableAmount) || 0,
            tmps: Number(v.tmps) || 0,
            headcount: Number(v.headcount ?? v.total_employees) || 0,
          }
        : undefined;

      const response = await fetch('/api/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessmentId: state.assessmentId,
          sectorCode: state.sectorCode,
          scorecardType: state.scorecardType,
          entityValues,
          employees,
          shareholders,
          suppliers,
          contributions,
          financials,
        }),
      });

      if (!response.ok) throw new Error('Calculation failed');

      const result: ScorecardResult = await response.json();
      setState(prev => ({ ...prev, scorecardResult: result, isCalculating: false }));

      toast({
        title: 'Scorecard calculated',
        description: `Total: ${result.totalPoints.toFixed(2)} points · Level ${result.beeLevel}`,
      });
    } catch (err) {
      toast({
        title: 'Calculation failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
      setState(prev => ({ ...prev, isCalculating: false }));
    }
  }, [state.values, state.assessmentId, state.sectorCode, state.scorecardType, toast]);

  const saveScorecard = useCallback(async () => {
    setState(prev => ({ ...prev, isSaving: true }));

    try {
      const response = await fetch('/api/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessmentId: state.assessmentId,
          clientId,
          financialYear: yearEnd,
          sectorCode: state.sectorCode,
          scorecardType: state.scorecardType,
          values: state.values,
          result: state.scorecardResult,
        }),
      });

      if (!response.ok) throw new Error('Save failed');

      toast({ title: 'Scorecard saved successfully' });
      
      // Clear draft
      localStorage.removeItem(`scorecard-draft-${state.assessmentId}`);
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setState(prev => ({ ...prev, isSaving: false }));
    }
  }, [state, clientId, yearEnd, toast]);

  const navigatePillar = useCallback((direction: 'prev' | 'next') => {
    setState(prev => {
      const newIndex = direction === 'next' 
        ? Math.min(prev.activePillarIndex + 1, (prev.manifest?.pillarPacks.length || 1) - 1)
        : Math.max(prev.activePillarIndex - 1, 0);
      return { ...prev, activePillarIndex: newIndex };
    });
  }, []);

  // Derived values
  const sortedPillars = useMemo(() => {
    if (!state.manifest) return [];
    return [...state.manifest.pillarPacks].sort((a, b) => {
      const idxA = PILLAR_ORDER.indexOf(a.pillarCode);
      const idxB = PILLAR_ORDER.indexOf(b.pillarCode);
      return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
    });
  }, [state.manifest]);

  const activePillar = sortedPillars[state.activePillarIndex];
  const activeCriterionResults = useMemo(() => {
    if (!state.scorecardResult || !activePillar) return [];
    const pillarResult = state.scorecardResult.pillars.find(p => p.pillarCode === activePillar.pillarCode);
    return pillarResult?.criteria || [];
  }, [state.scorecardResult, activePillar]);

  const overallProgress = useMemo(() => {
    if (!state.manifest) return 0;
    const totalFields = state.manifest.pillarPacks.reduce((sum, p) => sum + p.entities.length, 0);
    const filledFields = Object.values(state.values).filter(v => v !== undefined && v !== null && v !== '').length;
    return totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;
  }, [state.manifest, state.values]);

  const allPillarsValid = useMemo(() => {
    for (const pillar of sortedPillars) {
      if (!state.pillarValidation.get(pillar.pillarCode)) return false;
    }
    return true;
  }, [sortedPillars, state.pillarValidation]);

  if (state.isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 text-[#d1d1d6] animate-spin mx-auto" />
          <p className="text-[#636366] text-sm">Loading scorecard template...</p>
        </div>
      </div>
    );
  }

  if (!state.manifest) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h2 className="text-white text-lg font-semibold">Failed to load scorecard</h2>
          <p className="text-[#636366] text-sm">
            Could not load the {state.sectorCode} {state.scorecardType} template.
          </p>
          <button
            onClick={() => setLocation('/dashboard')}
            className="px-4 py-2 bg-white/[0.12] text-white rounded-lg text-sm hover:bg-white/[0.18] transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="h-14 sticky top-0 z-20 bg-black border-b border-[#2c2c2e]">
        <div className="max-w-[1600px] mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setLocation('/dashboard')}
              className="flex items-center gap-2 text-[#98989f] hover:text-white transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="text-[13px] font-medium">Back</span>
            </button>
            <div className="w-px h-5 bg-[#2c2c2e]" />
            <div>
              <h1 className="text-[14px] font-semibold text-white">
                {state.sectorCode} {state.scorecardType} Scorecard
              </h1>
              <p className="text-[11px] text-[#636366]">
                {clientId ? `Client: ${clientId}` : 'New Assessment'}
                {yearEnd && ` · FYE: ${yearEnd}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Progress */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1c1c1e] rounded-lg border border-[#2c2c2e]">
              <span className="text-[11px] text-[#636366]">Progress</span>
              <div className="w-20 h-1.5 rounded-full bg-[#2c2c2e] overflow-hidden">
                <div 
                  className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
              <span className="text-[11px] font-medium text-emerald-400">{overallProgress}%</span>
            </div>

            {/* Actions */}
            <button
              onClick={calculateScorecard}
              disabled={state.isCalculating}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.12] hover:bg-white/[0.18] disabled:opacity-50 text-white rounded-lg text-[12px] font-semibold transition-colors"
            >
              {state.isCalculating ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculating...</>
              ) : (
                <><Calculator className="w-3.5 h-3.5" /> Calculate</>
              )}
            </button>

            <button
              onClick={saveScorecard}
              disabled={state.isSaving || !state.scorecardResult}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:bg-[#2c2c2e] text-white rounded-lg text-[12px] font-semibold transition-colors"
            >
              {state.isSaving ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</>
              ) : (
                <><Save className="w-3.5 h-3.5" /> Save</>
              )}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-6 py-6 flex gap-6">
        {/* Sidebar - Pillar Navigation */}
        <aside className="w-64 shrink-0 space-y-2">
          {sortedPillars.map((pillar, index) => {
            const Icon = PILLAR_ICONS[pillar.pillarCode] || Building2;
            const isActive = index === state.activePillarIndex;
            const isValid = state.pillarValidation.get(pillar.pillarCode);
            
            // Calculate completion for this pillar
            const completedFields = pillar.entities.filter(e => 
              state.values[e.id] !== undefined && state.values[e.id] !== null && state.values[e.id] !== ''
            ).length;
            const completionPct = pillar.entities.length > 0 
              ? Math.round((completedFields / pillar.entities.length) * 100) 
              : 0;

            return (
              <button
                key={pillar.pillarCode}
                onClick={() => setState(prev => ({ ...prev, activePillarIndex: index }))}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all
                  ${isActive 
                    ? 'bg-white/[0.08] ring-1 ring-white/[0.08]' 
                    : 'hover:bg-white/[0.04]'
                  }
                `}
              >
                <div className={`
                  w-8 h-8 rounded-lg flex items-center justify-center shrink-0
                  ${isActive ? 'bg-white/[0.08]' : 'bg-[#1c1c1e]'}
                `}>
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-[#636366]'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] font-medium truncate ${isActive ? 'text-white' : 'text-[#d1d1d6]'}`}>
                    {pillar.pillarName}
                  </p>
                  <p className="text-[10px] text-[#636366]">
                    {completionPct}% complete
                  </p>
                </div>
                {isValid ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-[#2c2c2e] shrink-0" />
                )}
              </button>
            );
          })}

          {/* Results Summary */}
          {state.scorecardResult && (
            <div className="mt-6 p-4 bg-[#1c1c1e] rounded-2xl border border-[#2c2c2e]">
              <h3 className="text-[12px] font-medium text-[#636366] uppercase tracking-wider mb-3">
                Results
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[#d1d1d6]">Level</span>
                  <span className="text-[18px] font-bold text-white">
                    {state.scorecardResult.beeLevel}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[#d1d1d6]">Total</span>
                  <span className="text-[16px] font-mono font-medium text-emerald-400">
                    {state.scorecardResult.totalPoints.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[#d1d1d6]">Recognition</span>
                  <span className="text-[13px] font-medium text-white">
                    {state.scorecardResult.recognitionLevel}%
                  </span>
                </div>
              </div>

              {state.scorecardResult.isDiscounted && (
                <div className="mt-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-[11px] text-red-400">
                    Level discounted due to failed sub-minimums
                  </p>
                </div>
              )}
            </div>
          )}
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          {activePillar && (
            <PillarForm
              pillar={activePillar}
              values={state.values}
              onChange={handleValueChange}
              onValidate={(isValid) => handlePillarValidate(activePillar.pillarCode, isValid)}
              criterionResults={activeCriterionResults}
              isCalculating={state.isCalculating}
            />
          )}

          {/* Navigation Footer */}
          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={() => navigatePillar('prev')}
              disabled={state.activePillarIndex === 0}
              className="flex items-center gap-2 px-4 py-2 text-[#636366] hover:text-white disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>

            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[#636366]">
                {state.activePillarIndex + 1} of {sortedPillars.length}
              </span>
            </div>

            {state.activePillarIndex < sortedPillars.length - 1 ? (
              <button
                onClick={() => navigatePillar('next')}
                className="flex items-center gap-2 px-4 py-2 bg-white/[0.12] hover:bg-white/[0.18] text-white rounded-lg text-[13px] font-medium transition-colors"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={calculateScorecard}
                disabled={state.isCalculating}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-[13px] font-medium transition-colors"
              >
                {state.isCalculating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Calculating...</>
                ) : (
                  <><Calculator className="w-4 h-4" /> Calculate Score</>
                )}
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

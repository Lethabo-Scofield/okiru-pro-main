/**
 * Pillar Form Container
 *
 * Displays and manages all entity fields for a single B-BBEE pillar.
 * Handles validation, auto-save, and progress tracking.
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { CheckCircle2, AlertCircle, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import { EntityFieldInput, validateField } from './EntityFieldInputs';
import type { PillarPack, EntityField, CriterionEntity } from '@api/pipeline/extraction/entityManifest';
import type { CriterionResult } from '@api/pipeline/rules/calculationEngine';

// ============================================================================
// Types
// ============================================================================

export interface PillarFormProps {
  pillar: PillarPack;
  values: Record<string, unknown>;
  onChange: (entityId: string, value: unknown) => void;
  onValidate: (isValid: boolean) => void;
  criterionResults?: CriterionResult[];
  isCalculating?: boolean;
  defaultExpanded?: boolean;
}

interface FieldGroup {
  name: string;
  fields: EntityField[];
  completedCount: number;
  totalCount: number;
}

// ============================================================================
// Pillar Form Component
// ============================================================================

export function PillarForm({
  pillar,
  values,
  onChange,
  onValidate,
  criterionResults,
  isCalculating,
  defaultExpanded = true
}: PillarFormProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    if (!defaultExpanded) return new Set();
    return new Set(pillar.entities.map(e => e.ui?.group || 'General'));
  });
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
  const [validationErrors, setValidationErrors] = useState<Map<string, string>>(new Map());

  // Group fields by their ui.group
  const fieldGroups = useMemo((): FieldGroup[] => {
    const groups = new Map<string, EntityField[]>();
    
    for (const field of pillar.entities) {
      const groupName = field.ui?.group || 'General';
      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }
      groups.get(groupName)!.push(field);
    }

    return Array.from(groups.entries()).map(([name, fields]) => ({
      name,
      fields,
      completedCount: fields.filter(f => {
        const val = values[f.id];
        const validation = validateField(f, val);
        return validation.valid && val !== undefined && val !== null && val !== '';
      }).length,
      totalCount: fields.length
    }));
  }, [pillar.entities, values]);

  // Calculate overall completion
  const completionStats = useMemo(() => {
    const totalFields = pillar.entities.length;
    const completedFields = pillar.entities.filter(f => {
      const val = values[f.id];
      const validation = validateField(f, val);
      return validation.valid && val !== undefined && val !== null && val !== '';
    }).length;
    const requiredFields = pillar.entities.filter(f => f.required);
    const completedRequired = requiredFields.filter(f => {
      const val = values[f.id];
      const validation = validateField(f, val);
      return validation.valid && val !== undefined && val !== null && val !== '';
    }).length;

    return {
      total: totalFields,
      completed: completedFields,
      percentage: totalFields > 0 ? Math.round((completedFields / totalFields) * 100) : 0,
      requiredTotal: requiredFields.length,
      requiredCompleted: completedRequired,
      isComplete: requiredFields.length === 0 || completedRequired === requiredFields.length
    };
  }, [pillar.entities, values]);

  // Validate all fields and notify parent
  useEffect(() => {
    const errors = new Map<string, string>();
    let hasRequiredErrors = false;

    for (const field of pillar.entities) {
      const val = values[field.id];
      const validation = validateField(field, val);
      
      if (!validation.valid) {
        errors.set(field.id, validation.error!);
        if (field.required) hasRequiredErrors = true;
      }
    }

    setValidationErrors(errors);
    onValidate(!hasRequiredErrors);
  }, [pillar.entities, values, onValidate]);

  const toggleGroup = useCallback((groupName: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  }, []);

  const handleFieldChange = useCallback((fieldId: string, value: unknown) => {
    setTouchedFields(prev => new Set(prev).add(fieldId));
    onChange(fieldId, value);
  }, [onChange]);

  // Find criterion result for a field
  const getCriterionResultsForField = useCallback((field: EntityField): CriterionResult[] => {
    if (!criterionResults) return [];
    return criterionResults.filter(cr => field.criterionCodes.includes(cr.criterionCode));
  }, [criterionResults]);

  // Get color based on completion
  const getCompletionColor = (percentage: number) => {
    if (percentage >= 80) return 'text-emerald-400';
    if (percentage >= 50) return 'text-amber-400';
    return 'text-[#636366]';
  };

  const getCompletionBg = (percentage: number) => {
    if (percentage >= 80) return 'bg-emerald-500';
    if (percentage >= 50) return 'bg-amber-500';
    return 'bg-[#636366]';
  };

  return (
    <div className="space-y-4">
      {/* Pillar Header */}
      <div className="flex items-center justify-between p-4 bg-[#1c1c1e] rounded-2xl border border-[#2c2c2e]">
        <div className="flex items-center gap-3">
          <div className={`
            w-10 h-10 rounded-xl flex items-center justify-center
            ${completionStats.isComplete ? 'bg-emerald-500/10' : 'bg-white/[0.06]'}
            ${completionStats.isComplete ? 'ring-1 ring-emerald-500/20' : 'ring-1 ring-white/[0.06]'}
          `}>
            {completionStats.isComplete ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <AlertCircle className="w-5 h-5 text-[#636366]" />
            )}
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-white">{pillar.pillarName}</h3>
            <p className="text-[12px] text-[#636366]">
              {completionStats.requiredCompleted}/{completionStats.requiredTotal} required fields
              {pillar.maxPoints > 0 && ` · ${pillar.maxPoints} max points`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Completion Ring */}
          <div className="flex items-center gap-2">
            <svg width="36" height="36" viewBox="0 0 36 36" className="-rotate-90">
              <circle cx="18" cy="18" r="14" fill="none" stroke="#2c2c2e" strokeWidth="3" />
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${(completionStats.percentage / 100) * 88} 88`}
                className={`${getCompletionColor(completionStats.percentage)} transition-all duration-500`}
              />
            </svg>
            <span className={`text-[13px] font-medium ${getCompletionColor(completionStats.percentage)}`}>
              {completionStats.percentage}%
            </span>
          </div>

          {/* Score display if available */}
          {criterionResults && criterionResults.length > 0 && (
            <div className="text-right">
              <div className="text-[18px] font-bold font-mono text-white">
                {criterionResults.reduce((sum, cr) => sum + cr.points, 0).toFixed(2)}
              </div>
              <div className="text-[10px] text-[#636366] uppercase tracking-wider">Points</div>
            </div>
          )}
        </div>
      </div>

      {/* Field Groups */}
      <div className="space-y-3">
        {fieldGroups.map(group => {
          const isExpanded = expandedGroups.has(group.name);
          const completionPct = group.totalCount > 0 
            ? Math.round((group.completedCount / group.totalCount) * 100) 
            : 0;

          return (
            <div 
              key={group.name}
              className="bg-[#111111] rounded-2xl border border-[#1e1e1e] overflow-hidden"
            >
              {/* Group Header */}
              <button
                onClick={() => toggleGroup(group.name)}
                className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-[#636366]" />
                  ) : (
                    <ChevronUp className="w-4 h-4 text-[#636366]" />
                  )}
                  <span className="text-[14px] font-medium text-white">{group.name}</span>
                  <span className="text-[12px] text-[#636366]">
                    {group.completedCount}/{group.totalCount}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 rounded-full bg-[#2c2c2e] overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${getCompletionBg(completionPct)} transition-all duration-300`}
                      style={{ width: `${completionPct}%` }}
                    />
                  </div>
                </div>
              </button>

              {/* Group Fields */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-4">
                  {group.fields.map(field => {
                    const value = values[field.id];
                    const error = validationErrors.get(field.id);
                    const isTouched = touchedFields.has(field.id);
                    const fieldCriteriaResults = getCriterionResultsForField(field);
                    const hasCriterionResult = fieldCriteriaResults.length > 0;

                    return (
                      <div key={field.id} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[13px] text-[#d1d1d6] flex items-center gap-1.5">
                            {field.name}
                            {field.required && (
                              <span className="text-red-400">*</span>
                            )}
                          </label>
                          
                          {/* Criterion result indicator */}
                          {hasCriterionResult && (
                            <div className="flex items-center gap-1.5">
                              {fieldCriteriaResults.map(cr => (
                                <span 
                                  key={cr.criterionCode}
                                  className={`
                                    text-[10px] px-1.5 py-0.5 rounded font-medium
                                    ${cr.points > 0 
                                      ? 'bg-emerald-500/10 text-emerald-400' 
                                      : 'bg-[#2c2c2e] text-[#636366]'
                                    }
                                  `}
                                  title={cr.name}
                                >
                                  {cr.points.toFixed(1)} pts
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <EntityFieldInput
                          field={field}
                          value={value}
                          onChange={(val) => handleFieldChange(field.id, val)}
                          disabled={isCalculating}
                          size="md"
                        />

                        {/* Error message */}
                        {isTouched && error && (
                          <p className="text-xs text-red-400 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {error}
                          </p>
                        )}

                        {/* Extraction hints */}
                        {field.extraction && (
                          <div className="flex items-center gap-1 text-[10px] text-[#636366]">
                            <HelpCircle className="w-3 h-3" />
                            <span>Look for: {field.extraction.aliases.slice(0, 3).join(', ')}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Criterion Results Summary */}
      {criterionResults && criterionResults.length > 0 && (
        <div className="p-4 bg-[#1c1c1e] rounded-2xl border border-[#2c2c2e]">
          <h4 className="text-[13px] font-medium text-white mb-3">Criterion Scores</h4>
          <div className="space-y-2">
            {criterionResults.map(cr => (
              <div 
                key={cr.criterionCode}
                className="flex items-center justify-between py-2 border-b border-[#2c2c2e] last:border-0"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-[#d1d1d6]">{cr.name}</span>
                  {cr.targetMet && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-[#636366]">{cr.percentage.toFixed(0)}%</span>
                  <span className={`
                    text-[13px] font-mono font-medium
                    ${cr.points > 0 ? 'text-emerald-400' : 'text-[#636366]'}
                  `}>
                    {cr.points.toFixed(2)}
                    <span className="text-[#636366]">/{cr.maxPoints}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

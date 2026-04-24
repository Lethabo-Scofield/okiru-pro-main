/**
 * Pillar Sidebar Component
 *
 * Navigation sidebar for the Build flow - shows all 8 B-BBEE pillars
 * with completion status and allows free navigation between them.
 */

import { 
  TrendingUp, Building2, Shield, Users, BookOpen, 
  ShoppingCart, Handshake, HeartHandshake, Trophy, CheckCircle2 
} from 'lucide-react';
import type { PillarPack } from './types';

// ============================================================================
// Types
// ============================================================================

export interface PillarSidebarProps {
  pillars: PillarPack[];
  values: Record<string, unknown>;
  activePillarCode: string;
  onSelectPillar: (pillarCode: string) => void;
  validationStatus: Map<string, boolean>;
}

// ============================================================================
// Pillar Metadata
// ============================================================================

const PILLAR_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  financials: TrendingUp,
  ownership: Building2,
  managementControl: Shield,
  employmentEquity: Users,
  skillsDevelopment: BookOpen,
  preferentialProcurement: ShoppingCart,
  enterpriseSupplierDevelopment: Handshake,
  socioEconomicDevelopment: HeartHandshake,
  yesInitiative: Trophy,
};

const PILLAR_ORDER = [
  'financials',
  'ownership',
  'managementControl',
  // NOTE: employmentEquity merged into managementControl per B-BBEE codes
  'skillsDevelopment',
  'preferentialProcurement',
  'enterpriseSupplierDevelopment',
  'socioEconomicDevelopment',
  'yesInitiative',
];

// ============================================================================
// Helper Functions
// ============================================================================

function getPillarCompletion(pillar: PillarPack, values: Record<string, unknown>): {
  completed: number;
  total: number;
  percentage: number;
  isComplete: boolean;
} {
  const total = pillar.entities.length;
  if (total === 0) return { completed: 0, total: 0, percentage: 0, isComplete: true };

  const completed = pillar.entities.filter(e => {
    const val = values[e.id];
    return val !== undefined && val !== null && val !== '';
  }).length;

  return {
    completed,
    total,
    percentage: Math.round((completed / total) * 100),
    isComplete: completed === total
  };
}

// ============================================================================
// Component
// ============================================================================

export function PillarSidebar({
  pillars,
  values,
  activePillarCode,
  onSelectPillar,
  validationStatus
}: PillarSidebarProps) {
  // Sort pillars according to defined order
  const sortedPillars = [...pillars].sort((a, b) => {
    const idxA = PILLAR_ORDER.indexOf(a.pillarCode);
    const idxB = PILLAR_ORDER.indexOf(b.pillarCode);
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  });

  return (
    <aside className="w-64 shrink-0 space-y-1">
      {sortedPillars.map((pillar) => {
        const Icon = PILLAR_ICONS[pillar.pillarCode] || Building2;
        const isActive = pillar.pillarCode === activePillarCode;
        const isValid = validationStatus.get(pillar.pillarCode) ?? false;
        const completion = getPillarCompletion(pillar, values);

        return (
          <button
            key={pillar.pillarCode}
            onClick={() => onSelectPillar(pillar.pillarCode)}
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
              <p className={`text-[13px] font-medium leading-tight [overflow-wrap:anywhere] ${isActive ? 'text-white' : 'text-[#d1d1d6]'}`}>
                {pillar.pillarName}
              </p>
              <p className="text-[10px] text-[#636366]">
                {completion.percentage}% complete
              </p>
            </div>

            {/* Completion indicator */}
            {completion.isComplete ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <div className="w-4 h-4 rounded-full border-2 border-[#2c2c2e] shrink-0" />
            )}
          </button>
        );
      })}
    </aside>
  );
}

// ============================================================================
// Compact Version (for smaller screens or overlays)
// ============================================================================

export interface CompactPillarNavProps {
  pillars: PillarPack[];
  activePillarCode: string;
  onSelectPillar: (pillarCode: string) => void;
  className?: string;
}

export function CompactPillarNav({
  pillars,
  activePillarCode,
  onSelectPillar,
  className = ''
}: CompactPillarNavProps) {
  const sortedPillars = [...pillars].sort((a, b) => {
    const idxA = PILLAR_ORDER.indexOf(a.pillarCode);
    const idxB = PILLAR_ORDER.indexOf(b.pillarCode);
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  });

  return (
    <div className={`flex gap-1 overflow-x-auto pb-2 ${className}`}>
      {sortedPillars.map((pillar) => {
        const Icon = PILLAR_ICONS[pillar.pillarCode] || Building2;
        const isActive = pillar.pillarCode === activePillarCode;

        return (
          <button
            key={pillar.pillarCode}
            onClick={() => onSelectPillar(pillar.pillarCode)}
            className={`
              flex items-center gap-2 px-3 py-2 rounded-lg whitespace-nowrap transition-all
              ${isActive 
                ? 'bg-white/[0.08] text-white' 
                : 'bg-[#1c1c1e] text-[#8e8e93] hover:bg-white/[0.04]'
              }
            `}
          >
            <Icon className="w-4 h-4" />
            <span className="text-[12px] font-medium">{pillar.pillarName}</span>
          </button>
        );
      })}
    </div>
  );
}

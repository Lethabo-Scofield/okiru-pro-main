/**
 * ScorecardPillarSummary
 *
 * Renders a single pillar row in the restricted (summary-only) view.
 * Used when the current user has no view access to the full breakdown for a pillar.
 *
 * Full view  (permitted pillar):  shows bar, scores, sub-minimum badge.
 * Summary view (restricted pillar): shows only "Pillar Name — X.XX / Y points" with no breakdown.
 */

import { Lock } from 'lucide-react';

export interface PillarSummaryRow {
  code: string;
  label: string;
  score: number;
  maxPoints: number;
  color?: string;
  subMinimumMet?: boolean;
  /** If true, render full breakdown (bar + sub-min badge). If false, summary only. */
  isVisible: boolean;
}

interface ScorecardPillarSummaryProps {
  pillar: PillarSummaryRow;
  /** CSS class appended to the outermost element */
  className?: string;
}

export function ScorecardPillarSummary({ pillar, className }: ScorecardPillarSummaryProps) {
  const pct = pillar.maxPoints > 0 ? Math.min(100, (pillar.score / pillar.maxPoints) * 100) : 0;

  if (!pillar.isVisible) {
    return (
      <div
        className={className}
        style={{ borderBottom: '1px solid #2c2c2e' }}
        data-testid={`scorecard-pillar-summary-${pillar.code}`}
      >
        <div className="px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <Lock className="w-3.5 h-3.5 shrink-0" style={{ color: '#636366' }} />
            <span className="text-sm font-medium truncate" style={{ color: '#636366' }}>
              {pillar.label}
            </span>
          </div>
          <span className="text-sm font-semibold shrink-0" style={{ color: '#48484a' }}>
            — / {pillar.maxPoints} pts
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{ borderBottom: '1px solid #2c2c2e' }}
      data-testid={`scorecard-pillar-row-${pillar.code}`}
    >
      <div className="px-6 py-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: '#d1d1d6' }}>
              {pillar.label}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {pillar.subMinimumMet === false && (
              <span
                className="text-[10px] font-semibold uppercase"
                style={{ color: '#f59e0b' }}
                title="Sub-minimum not met"
              >
                ⚠ Sub-min
              </span>
            )}
            {pillar.subMinimumMet === true && (
              <span className="text-[10px] font-semibold uppercase" style={{ color: '#22c55e' }}>
                ✓ Sub-min
              </span>
            )}
            <span className="text-sm font-bold text-white">
              {typeof pillar.score === 'number' ? pillar.score.toFixed(2) : pillar.score}
              {' '}
              <span style={{ color: '#8e8e93', fontWeight: 400 }}>/ {pillar.maxPoints}</span>
            </span>
          </div>
        </div>
        <div
          className="w-full h-2 rounded-full overflow-hidden"
          style={{ background: '#2c2c2e' }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: pillar.color || '#5e9bff' }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * ScorecardPillarList
 *
 * Renders the full pillar breakdown, using ScorecardPillarSummary for each row.
 * Pillars not in `visiblePillarCodes` are shown in restricted/summary mode.
 *
 * Usage:
 *   <ScorecardPillarList
 *     pillars={allPillarRows}
 *     visiblePillarCodes={memberScopes ? new Set(memberScopes) : null}
 *   />
 *
 * If visiblePillarCodes is null/undefined, all pillars are shown in full mode.
 */
export interface ScorecardPillarListProps {
  pillars: Omit<PillarSummaryRow, 'isVisible'>[];
  /** Set of calculator codes the current user may view in full. Null = show all. */
  visiblePillarCodes?: Set<string> | null;
}

export function ScorecardPillarList({ pillars, visiblePillarCodes }: ScorecardPillarListProps) {
  return (
    <div>
      {pillars.map((p) => (
        <ScorecardPillarSummary
          key={p.code}
          pillar={{
            ...p,
            isVisible: !visiblePillarCodes || visiblePillarCodes.has(p.code),
          }}
        />
      ))}
    </div>
  );
}

export default ScorecardPillarSummary;

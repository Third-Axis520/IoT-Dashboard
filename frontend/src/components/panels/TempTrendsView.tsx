import React, { useMemo } from 'react';
import type { Equipment } from '../../types';
import { cn } from '../../utils/cn';
import { PointTrendCard } from './PointTrendCard';

interface TempTrendsViewProps {
  displayedEquipments: { lineId: string; eq: Equipment }[];
  onUpdateLimits: (lineId: string, eqId: string, pointId: string, ucl: number, lcl: number) => void;
}

/**
 * Trend view — groups trend cards by equipment with section headers.
 *
 * Designed for clarity over density:
 *   - Hard cap at 4 cards per row (configurable via responsive breakpoints).
 *   - Each equipment is its own section with a labeled header.
 *   - No "compact" mode: full-fidelity trend chart + UCL/LCL labels on every card.
 *   - Vertical scroll for tall lists. Alert UI lives elsewhere now — the bell
 *     dropdown in AppToolbar opens the history, and the real-time marquee is
 *     pinned to the app footer — so this view gives all vertical space to the
 *     trend cards themselves.
 */
export const TempTrendsView = React.memo(function TempTrendsView({
  displayedEquipments, onUpdateLimits,
}: TempTrendsViewProps) {
  // Keep equipments that actually have points to render.
  const groups = useMemo(
    () => displayedEquipments.filter(({ eq }) => eq.points.length > 0),
    [displayedEquipments]
  );

  const totalPoints = useMemo(
    () => groups.reduce((s, { eq }) => s + eq.points.length, 0),
    [groups]
  );

  if (totalPoints === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
        No monitoring points available in this line.
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full min-h-0 overflow-hidden relative border border-[var(--border-base)] rounded-xl glass-panel">
      <div className="flex-1 min-h-0 overflow-y-auto animate-in fade-in duration-500">
        <div className="flex flex-col gap-6 md:gap-8 p-4 md:p-6">
          {groups.map(({ lineId, eq }) => (
            <section key={`${lineId}-${eq.id}`} className="flex flex-col gap-3">
              {/* Section header — quiet but findable */}
              <header className="flex items-end justify-between gap-3 border-b border-[var(--border-base)]/60 pb-1.5">
                <div className="flex items-baseline gap-2 min-w-0">
                  <h3 className="text-sm md:text-base font-semibold text-[var(--text-main)] tracking-wide truncate">
                    {eq.name}
                  </h3>
                  <span className="text-[10px] font-mono text-[var(--text-muted)] border border-[var(--border-base)] px-1.5 py-0.5 rounded bg-[var(--border-base)]/30 shrink-0">
                    {eq.deviceId}
                  </span>
                </div>
                <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] shrink-0">
                  {eq.points.length} {eq.points.length === 1 ? 'point' : 'points'}
                </span>
              </header>

              {/* 4-col max grid; responsive down to 1 col on phones.
                  Single-point equipments cap at 2 cols so they don't stretch into
                  a billboard, but still feel weightier than a quarter-width orphan. */}
              <div
                className={cn(
                  'grid gap-3 md:gap-4',
                  eq.points.length === 1
                    ? 'grid-cols-1 sm:grid-cols-2'
                    : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                )}
              >
                {eq.points.map(point => (
                  <div
                    key={point.id}
                    className="h-[176px] md:h-[184px] flex"
                  >
                    <PointTrendCard
                      lineId={lineId}
                      eq={eq}
                      point={point}
                      compact={false}
                      onUpdateLimits={onUpdateLimits}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
});

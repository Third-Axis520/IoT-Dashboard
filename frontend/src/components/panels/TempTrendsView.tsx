import React, { useState, useRef, useCallback, useMemo } from 'react';
import type { AlertRecord, Equipment } from '../../types';
import { cn } from '../../utils/cn';
import { PointTrendCard } from './PointTrendCard';
import { AlertPanel } from './AlertPanel';

interface TempTrendsViewProps {
  displayedEquipments: { lineId: string; eq: Equipment }[];
  alerts: AlertRecord[];
  onUpdateLimits: (lineId: string, eqId: string, pointId: string, ucl: number, lcl: number) => void;
}

/**
 * Trend view — groups trend cards by equipment with section headers.
 *
 * Designed for clarity over density:
 *   - Hard cap at 4 cards per row (configurable via responsive breakpoints).
 *   - Each equipment is its own section with a labeled header.
 *   - No "compact" mode: full-fidelity trend chart + UCL/LCL labels on every card.
 *   - Vertical scroll for tall lists; alert dock stays sticky at the bottom.
 *
 * Replaced the previous sqrt-derived flex-wrap layout that turned into a
 * 7-column wall once the line had ~27 points across 6 equipments.
 */
export const TempTrendsView = React.memo(function TempTrendsView({
  displayedEquipments, alerts, onUpdateLimits,
}: TempTrendsViewProps) {
  const [alertHeight, setAlertHeight] = useState(48);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const newHeight = containerRect.bottom - e.clientY;
    setAlertHeight(Math.max(48, Math.min(containerRect.height * 0.8, newHeight)));
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [handleMouseMove]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

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
    <div
      ref={containerRef}
      className="flex flex-col w-full h-full min-h-0 overflow-hidden relative border border-[var(--border-base)] rounded-xl glass-panel"
    >
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
                  // Fixed height keeps cards wide-short (chart aspect ~16:7 at xl),
                  // giving the time axis dominance over the vertical band — line
                  // flow is the primary signal in this view.
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

      {/* Alert dock resizer */}
      <div
        className="h-2 w-full cursor-row-resize bg-[var(--border-base)] hover:bg-[var(--accent-blue)] active:bg-[var(--accent-blue)] transition-colors shrink-0 z-20 relative flex items-center justify-center group"
        onMouseDown={handleMouseDown}
      >
        <div className="w-16 h-1 bg-[var(--bg-scrollbar)] group-hover:bg-[var(--accent-blue)] rounded-full transition-colors pointer-events-none" />
      </div>

      <div style={{ height: alertHeight }} className="shrink-0 w-full glass-panel border-t-0 flex flex-col overflow-hidden">
        <AlertPanel
          alerts={alerts}
          height={alertHeight}
          onToggleExpand={() => setAlertHeight(h => h > 100 ? 48 : 300)}
        />
      </div>
    </div>
  );
});

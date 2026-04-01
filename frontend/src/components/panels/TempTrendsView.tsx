import React, { useState, useRef, useCallback, useMemo } from 'react';
import type { AlertRecord, Equipment, Point } from '../../types';
import { cn } from '../../utils/cn';
import { PointTrendCard } from './PointTrendCard';
import { AlertPanel } from './AlertPanel';

interface TempTrendsViewProps {
  displayedEquipments: { lineId: string; eq: Equipment }[];
  alerts: AlertRecord[];
  onUpdateLimits: (lineId: string, eqId: string, pointId: string, ucl: number, lcl: number) => void;
}

export const TempTrendsView = React.memo(function TempTrendsView({
  displayedEquipments, alerts, onUpdateLimits
}: TempTrendsViewProps) {
  const [alertHeight, setAlertHeight] = useState(48);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

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

  const allPoints = useMemo(() => {
    const points: { lineId: string; eq: Equipment; point: Point }[] = [];
    displayedEquipments.forEach(({ lineId, eq }) => {
      eq.points.forEach(p => {
        points.push({ lineId, eq, point: p });
      });
    });
    return points;
  }, [displayedEquipments]);

  const getFlexBasis = (count: number) => {
    if (count === 0) return '100%';
    const cols = Math.ceil(Math.sqrt(count * 1.5));
    return `calc(${100 / cols}% - 24px)`;
  };

  if (allPoints.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
        No monitoring points available in this line.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col w-full h-full min-h-0 overflow-hidden relative border border-[var(--border-base)] rounded-xl glass-panel">
      <div
        className={cn("flex-1 min-h-0 flex flex-wrap content-stretch items-stretch animate-in fade-in duration-500 overflow-y-auto", allPoints.length > 8 ? "gap-1 p-1" : "gap-4 md:gap-6 p-4")}
      >
        {allPoints.map(({ lineId, eq, point }) => (
          <div
            key={`${eq.id}-${point.id}`}
            className="flex-auto flex min-w-[150px]"
            style={{ flexBasis: getFlexBasis(allPoints.length) }}
          >
            <PointTrendCard
              lineId={lineId}
              eq={eq}
              point={point}
              compact={allPoints.length > 8}
              onUpdateLimits={onUpdateLimits}
            />
          </div>
        ))}
      </div>

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

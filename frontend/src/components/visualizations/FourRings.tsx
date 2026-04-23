import React from 'react';
import type { Point } from '../../types';
import { getStatusColor } from '../../constants/templates';
import { AnimatedValue } from './AnimatedValue';
import { usePointDrag } from '../../hooks/usePointDrag';

interface RingProgressProps {
  point: Point;
  index?: number;
  onPointSwap?: (dragIndex: number, dropIndex: number) => void;
  dragScope?: string;
}

const RingProgress = React.memo(function RingProgress({ point, index, onPointSwap, dragScope }: RingProgressProps) {
  const hasLimits = point.ucl > 0 && point.ucl > point.lcl;
  const percentage = hasLimits
    ? Math.min(100, Math.max(0, ((point.value - point.lcl) / (point.ucl - point.lcl)) * 100))
    : 0;
  const radius = 48.5;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  const dragProps = onPointSwap && index !== undefined
    ? usePointDrag({ index, onPointSwap, dragScope })
    : { draggable: false as const };

  return (
    <div
      className="flex flex-col items-center justify-center w-full h-full min-h-[80px] gap-1"
      {...dragProps}
    >
      <div className="relative flex-1 min-h-0 w-full flex items-center justify-center">
        <svg viewBox="0 0 100 100" className="transform -rotate-90 w-full h-full max-w-[200px] max-h-[200px]">
          <circle cx="50" cy="50" r={radius} fill="transparent" stroke="var(--border-base)" strokeWidth="3" />
          <circle
            cx="50" cy="50" r={radius} fill="transparent"
            stroke={getStatusColor(point.status)}
            strokeWidth="3" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset || 0}
            strokeLinecap="round" className="transition-all duration-500 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <AnimatedValue value={point.value} status={point.status} className="text-2xl md:text-3xl font-bold tracking-tighter" />
          {hasLimits && (
            <div className="flex gap-1 text-[7px] font-mono text-[var(--text-muted)] opacity-50 mt-0.5">
              <span>↑{point.ucl.toFixed(0)}</span>
              <span>↓{point.lcl.toFixed(0)}</span>
            </div>
          )}
        </div>
      </div>
      <span className="text-[10px] md:text-xs text-[var(--text-muted)] text-center leading-none">{point.name}</span>
    </div>
  );
});

interface FourRingsProps {
  points: Point[];
  onPointSwap?: (dragIndex: number, dropIndex: number) => void;
  dragScope?: string;
}

export const FourRings = React.memo(function FourRings({ points, onPointSwap, dragScope }: FourRingsProps) {
  return (
    <div className="grid grid-cols-2 gap-2 md:gap-4 h-full content-center place-items-center p-2">
      {points.slice(0, 4).map((p, i) => <RingProgress key={p.id} point={p} index={i} onPointSwap={onPointSwap} dragScope={dragScope} />)}
    </div>
  );
});

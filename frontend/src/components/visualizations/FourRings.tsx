import React from 'react';
import type { Point } from '../../types';
import { cn } from '../../utils/cn';
import { getStatusColor } from '../../constants/templates';
import { AnimatedValue } from './AnimatedValue';

interface RingProgressProps {
  point: Point;
  index?: number;
  onPointSwap?: (dragIndex: number, dropIndex: number) => void;
  dragScope?: string;
}

const RingProgress = React.memo(function RingProgress({ point, index, onPointSwap, dragScope }: RingProgressProps) {
  const percentage = Math.min(100, Math.max(0, ((point.value - point.lcl) / (point.ucl - point.lcl)) * 100));
  const radius = 48.5;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  const isHot = point.name.includes('热') || point.value > 50;

  return (
    <div
      className="flex flex-col items-center justify-center w-full h-full min-h-[80px] gap-1"
      draggable={!!onPointSwap}
      onDragStart={(e) => {
        if (onPointSwap && index !== undefined) {
          e.dataTransfer.setData('text/plain', index.toString());
          if (dragScope) e.dataTransfer.setData('dragScope', dragScope);
          e.dataTransfer.effectAllowed = 'move';
        }
      }}
      onDragOver={(e) => {
        if (onPointSwap) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }
      }}
      onDrop={(e) => {
        if (onPointSwap && index !== undefined) {
          e.preventDefault();
          if (dragScope && e.dataTransfer.getData('dragScope') !== dragScope) return;
          const dragIndex = parseInt(e.dataTransfer.getData('text/plain'));
          if (!isNaN(dragIndex) && dragIndex !== index) {
            onPointSwap(dragIndex, index);
          }
        }
      }}
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
          <AnimatedValue value={point.value} status={point.status} className={cn("text-2xl md:text-3xl font-bold tracking-tighter", isHot ? "text-[var(--accent-orange)]" : "text-[var(--accent-blue)]")} />
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

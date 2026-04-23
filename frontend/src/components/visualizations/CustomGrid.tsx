import React from 'react';
import type { Point } from '../../types';
import { AnimatedValue } from './AnimatedValue';
import { usePointDrag } from '../../hooks/usePointDrag';

interface CustomGridProps {
  points: Point[];
  onPointSwap?: (dragIndex: number, dropIndex: number) => void;
  dragScope?: string;
}

export const CustomGrid = React.memo(function CustomGrid({ points, onPointSwap, dragScope }: CustomGridProps) {
  return (
    <div className="grid grid-cols-2 gap-2 h-full content-start overflow-y-auto custom-scrollbar pr-1">
      {points.map((p, index) => {
        const dragProps = usePointDrag({ index, onPointSwap, dragScope });
        return (
        <div key={p.id}
          className="bg-[var(--border-base)]/30 rounded p-2 border border-[var(--border-base)]"
          {...dragProps}
        >
          <span className="text-[10px] text-[var(--text-muted)] block truncate">{p.name}</span>
          <AnimatedValue value={p.value} status={p.status} className="text-2xl font-bold" />
          {(p.ucl > 0 || p.lcl > 0) && (
            <div className="flex gap-1.5 text-[8px] font-mono text-[var(--text-muted)] opacity-50 mt-0.5">
              {p.ucl > 0 && <span>↑{p.ucl.toFixed(0)}</span>}
              {p.lcl > 0 && <span>↓{p.lcl.toFixed(0)}</span>}
            </div>
          )}
        </div>
      );
      })}
    </div>
  );
});

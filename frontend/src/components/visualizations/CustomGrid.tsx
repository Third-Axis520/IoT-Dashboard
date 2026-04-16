import React from 'react';
import type { Point } from '../../types';
import { AnimatedValue } from './AnimatedValue';

interface CustomGridProps {
  points: Point[];
  onPointSwap?: (dragIndex: number, dropIndex: number) => void;
  dragScope?: string;
}

export const CustomGrid = React.memo(function CustomGrid({ points, onPointSwap, dragScope }: CustomGridProps) {
  return (
    <div className="grid grid-cols-2 gap-2 h-full content-start overflow-y-auto custom-scrollbar pr-1">
      {points.map((p, index) => (
        <div key={p.id}
          className="bg-[var(--border-base)]/30 rounded p-2 border border-[var(--border-base)]"
          draggable={!!onPointSwap}
          onDragStart={(e) => {
            if (onPointSwap) {
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
            if (onPointSwap) {
              e.preventDefault();
              if (dragScope && e.dataTransfer.getData('dragScope') !== dragScope) return;
              const dragIndex = parseInt(e.dataTransfer.getData('text/plain'));
              if (!isNaN(dragIndex) && dragIndex !== index) {
                onPointSwap(dragIndex, index);
              }
            }
          }}
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
      ))}
    </div>
  );
});

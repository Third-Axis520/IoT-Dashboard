import React from 'react';
import type { Point } from '../../types';
import { AnimatedValue } from './AnimatedValue';

interface DualSideSparkProps {
  points: Point[];
  onPointSwap?: (dragIndex: number, dropIndex: number) => void;
  dragScope?: string;
}

export const DualSideSpark = React.memo(function DualSideSpark({ points, onPointSwap, dragScope }: DualSideSparkProps) {
  const renderPoint = (p: Point, index: number) => (
    <div key={p.id}
      className="bg-[var(--border-base)]/30 rounded p-2 flex justify-between items-start border border-[var(--border-base)]"
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
      <span className="text-[10px] text-[var(--text-muted)]">{p.name}</span>
      <div className="flex flex-col items-end">
        <div className="flex items-baseline gap-1">
          <AnimatedValue value={p.value} status={p.status} className="text-2xl font-bold" />
          <span className="text-[10px] text-[var(--text-muted)] opacity-60">{p.unit}</span>
        </div>
        {(p.ucl > 0 || p.lcl > 0) && (
          <div className="flex gap-1.5 text-[8px] font-mono text-[var(--text-muted)] opacity-50">
            {p.ucl > 0 && <span>↑{p.ucl.toFixed(0)}</span>}
            {p.lcl > 0 && <span>↓{p.lcl.toFixed(0)}</span>}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-full w-full gap-4 p-2">
      <div className="flex-1 flex flex-col gap-2">
        <div className="text-[10px] text-[var(--text-muted)] font-bold mb-1 text-center border-b border-[var(--border-base)] pb-1 tracking-widest">左侧 (LEFT)</div>
        {points.slice(0, 3).map((p, i) => renderPoint(p, i))}
      </div>
      <div className="flex-1 flex flex-col gap-2">
        <div className="text-[10px] text-[var(--text-muted)] font-bold mb-1 text-center border-b border-[var(--border-base)] pb-1 tracking-widest">右侧 (RIGHT)</div>
        {points.slice(3, 6).map((p, i) => renderPoint(p, i + 3))}
      </div>
    </div>
  );
});

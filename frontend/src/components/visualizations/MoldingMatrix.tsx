import React from 'react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import type { Point } from '../../types';
import { cn } from '../../utils/cn';
import { getStatusColor } from '../../constants/templates';
import { AnimatedValue } from './AnimatedValue';

interface MoldingMatrixProps {
  points: Point[];
  onPointSwap?: (dragIndex: number, dropIndex: number) => void;
  dragScope?: string;
}

export const MoldingMatrix = React.memo(function MoldingMatrix({ points, onPointSwap, dragScope }: MoldingMatrixProps) {
  const topLayer = points.slice(0, 3);
  const bottomLayer = points.slice(3, 6);

  const renderBlock = (p: Point, index: number) => {
    const isDanger = p.status === 'danger';
    const isWarning = p.status === 'warning';

    return (
      <div key={p.id}
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
        className={cn(
          "flex flex-col items-center justify-center p-2 rounded-md relative overflow-hidden transition-colors duration-300 h-full",
          isDanger ? "bg-[var(--accent-red)]/20 border border-[var(--accent-red)]" :
          isWarning ? "bg-[var(--accent-yellow)]/20 border border-[var(--accent-yellow)]" :
          "bg-[var(--border-base)] border border-transparent"
        )}>
        <div className="absolute bottom-0 left-0 right-0 h-1/2 opacity-20 pointer-events-none">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={p.history}>
              <defs>
                <linearGradient id={`grad-mold-${p.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={getStatusColor(p.status)} stopOpacity={1}/>
                  <stop offset="95%" stopColor={getStatusColor(p.status)} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="value" stroke="none" fill={`url(#grad-mold-${p.id})`} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <span className="text-[10px] text-[var(--text-muted)] mb-1 z-10">{p.name.replace(/上层|下层/, '') || p.name}</span>
        <div className="flex items-baseline gap-0.5 z-10">
          <AnimatedValue value={p.value} status={p.status} className="text-2xl md:text-3xl font-bold" />
          <span className="text-[9px] text-[var(--text-muted)] opacity-60">{p.unit}</span>
        </div>
        {isDanger && <div className="absolute inset-0 border-2 animate-breathe-danger pointer-events-none rounded-md z-20" />}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2 h-full justify-center">
      <div className="flex items-center gap-2 flex-1 min-h-0">
        <div className="w-6 text-[10px] text-[var(--text-muted)] writing-vertical-rl text-center font-bold">上层</div>
        <div className="flex-1 grid grid-cols-3 gap-2 h-full">{topLayer.map((p, i) => renderBlock(p, i))}</div>
      </div>
      <div className="flex items-center gap-2 flex-1 min-h-0">
        <div className="w-6 text-[10px] text-[var(--text-muted)] writing-vertical-rl text-center font-bold">下层</div>
        <div className="flex-1 grid grid-cols-3 gap-2 h-full">{bottomLayer.map((p, i) => renderBlock(p, i + 3))}</div>
      </div>
    </div>
  );
});

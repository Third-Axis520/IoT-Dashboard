import React from 'react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import type { Point } from '../../types';
import { getStatusColor } from '../../constants/templates';
import { AnimatedValue } from './AnimatedValue';

interface SingleKpiProps {
  points: Point[];
}

export const SingleKpi = React.memo(function SingleKpi({ points }: SingleKpiProps) {
  const point = points[0];
  if (!point) return null;

  return (
    <div className="relative flex flex-col items-center justify-center h-full w-full overflow-hidden rounded-lg">
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <AreaChart data={point.history}>
            <defs>
              <linearGradient id={`grad-single-${point.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={getStatusColor(point.status)} stopOpacity={1}/>
                <stop offset="95%" stopColor={getStatusColor(point.status)} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="value" stroke="none" fill={`url(#grad-single-${point.id})`} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <span className="text-sm md:text-base text-[var(--text-muted)] mb-2 z-10 font-medium">{point.name}</span>
      <div className="flex items-baseline gap-1 z-10">
        <AnimatedValue value={point.value} status={point.status} className="text-7xl md:text-8xl tracking-tight font-bold" />
        <span className="text-lg md:text-xl text-[var(--text-muted)] opacity-60">{point.unit}</span>
      </div>
      {(point.ucl > 0 || point.lcl > 0) && (
        <div className="flex gap-3 text-xs font-mono text-[var(--text-muted)] opacity-50 z-10 mt-1">
          {point.ucl > 0 && <span>↑ UCL {point.ucl.toFixed(1)}</span>}
          {point.lcl > 0 && <span>↓ LCL {point.lcl.toFixed(1)}</span>}
        </div>
      )}
    </div>
  );
});

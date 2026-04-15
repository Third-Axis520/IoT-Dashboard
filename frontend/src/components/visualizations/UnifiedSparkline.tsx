import React from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import type { Point, VisType } from '../../types';
import { getStatusColor } from '../../constants/templates';

interface UnifiedSparklineProps {
  points: Point[];
  visType: VisType;
}

export const UnifiedSparkline = React.memo(function UnifiedSparkline({ points, visType }: UnifiedSparklineProps) {
  return (
    <div className="h-10 shrink-0 w-full bg-[var(--bg-panel)] border-t border-[var(--border-base)] relative overflow-hidden">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <LineChart margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <YAxis domain={['dataMin - 1', 'dataMax + 1']} hide />
          {points.map((p, i) => (
            <Line
              key={p.id}
              data={p.history}
              type="monotone"
              dataKey="value"
              stroke={getStatusColor(p.status)}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              opacity={i === 0 ? 1 : 0.2}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

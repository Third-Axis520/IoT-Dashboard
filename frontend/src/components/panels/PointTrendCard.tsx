import React, { useState, useMemo } from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip, ReferenceLine, AreaChart, Area, ReferenceArea } from 'recharts';
import { useTranslation } from 'react-i18next';
import type { Equipment, Point } from '../../types';
import { cn } from '../../utils/cn';

interface PointTrendCardProps {
  lineId: string;
  eq: Equipment;
  point: Point;
  compact?: boolean;
  onUpdateLimits: (lineId: string, eqId: string, pointId: string, ucl: number, lcl: number) => void;
}

export const PointTrendCard = React.memo(function PointTrendCard({
  lineId, eq, point, compact = false, onUpdateLimits,
}: PointTrendCardProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editUcl, setEditUcl] = useState(point.ucl.toString());
  const [editLcl, setEditLcl] = useState(point.lcl.toString());

  const handleSave = () => {
    const ucl = parseFloat(editUcl);
    const lcl = parseFloat(editLcl);
    if (!isNaN(ucl) && !isNaN(lcl)) {
      onUpdateLimits(lineId, eq.id, point.id, ucl, lcl);
    }
    setIsEditing(false);
  };

  const isWarning = point.status === 'warning';
  const isDanger = point.status === 'danger';
  const isOffline = point.status === 'offline';

  const borderColor = isDanger ? 'border-[var(--accent-red-light)] animate-breathe-danger' : isWarning ? 'border-[var(--accent-yellow-light)] animate-breathe-warning' : isOffline ? 'border-[var(--text-muted)]/30' : 'border-[var(--border-trend)]';
  const shadowColor = isDanger ? '' : isWarning ? '' : isOffline ? '' : 'shadow-[0_0_15px_var(--border-base)]';
  const dotColor = isDanger ? 'bg-[var(--accent-red-light)]' : isWarning ? 'bg-[var(--accent-yellow-light)]' : isOffline ? 'bg-[var(--text-muted)]' : 'bg-[var(--accent-green)]';
  const textColor = isDanger ? 'text-[var(--accent-red-light)]' : isWarning ? 'text-[var(--accent-yellow-light)]' : isOffline ? 'text-[var(--text-muted)]' : 'text-[var(--accent-green)]';

  const chartData = point.history.map(h => ({ time: h.time, value: h.value }));

  // Smart Y-axis: zoom to current data range with ±50% padding (line sits
  // around the middle 50% of chart height for visible flow), and pull UCL/LCL
  // into view ONLY when they're within ~2 data-spans away. Previously the
  // domain was [LCL-padding, UCL+padding] which flattened the line into a
  // thin sliver whenever the sensor's data span was < 20% of (UCL-LCL).
  const { yMin, yMax, yAxisWidth } = useMemo(() => {
    const values = chartData.map(d => d.value);
    const dataMin = values.length > 0 ? Math.min(...values) : point.lcl;
    const dataMax = values.length > 0 ? Math.max(...values) : point.ucl;
    const isCounter = point.unit === '次' || point.unit === 'count';
    // Counters use 1 as the minimum granularity; analog sensors use 0.5.
    const minGranularity = isCounter ? 1 : 0.5;
    const dataSpan = Math.max(dataMax - dataMin, minGranularity);

    // Pad ±50% of data span → line takes ~50% of chart height.
    let lo = dataMin - dataSpan * 0.5;
    let hi = dataMax + dataSpan * 0.5;

    // Pull UCL into view if it's within 2 data-spans of the current visible top.
    if (point.ucl > 0 && point.ucl < hi + dataSpan * 2) {
      hi = Math.max(hi, point.ucl + dataSpan * 0.15);
    }
    // Same for LCL. Skip if LCL == 0 AND no UCL configured (no limits → data only).
    const limitsSet = point.ucl > 0 || point.lcl > 0;
    if (limitsSet && point.lcl > lo - dataSpan * 2) {
      lo = Math.min(lo, point.lcl - dataSpan * 0.15);
    }

    // Dynamic axis width — accommodate the longest formatted tick label.
    const decimals = isCounter ? 0 : 1;
    const labels = [lo.toFixed(decimals), hi.toFixed(decimals)];
    const maxLen = Math.max(...labels.map(s => s.length));
    const width = maxLen >= 6 ? 56 : maxLen >= 5 ? 48 : maxLen >= 4 ? 40 : 34;

    return { yMin: lo, yMax: hi, yAxisWidth: compact ? 0 : width };
  }, [chartData, point.ucl, point.lcl, point.unit, compact]);

  const renderChart = () => {
    const commonProps = {
      data: chartData,
      margin: { top: compact ? 5 : 10, right: 8, left: 0, bottom: 0 }
    };

    const commonAxes = (
      <>
        {!compact && (
          <XAxis
            dataKey="time"
            tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            stroke="var(--bg-scrollbar)"
            tick={{fill: 'var(--bg-scrollbar)', fontSize: 9}}
            axisLine={false}
            tickLine={false}
            minTickGap={30}
          />
        )}
        <YAxis
          domain={[yMin, yMax]}
          stroke="var(--bg-scrollbar)"
          tick={compact ? false : {fill: 'var(--bg-scrollbar)', fontSize: 9}}
          axisLine={false}
          tickLine={false}
          width={yAxisWidth}
        />
        <Tooltip
          contentStyle={{ backgroundColor: 'var(--bg-root)', borderColor: 'var(--border-trend)', borderRadius: '8px', fontSize: '12px' }}
          labelFormatter={(l) => new Date(l).toLocaleTimeString()}
        />
        <ReferenceArea y1={point.ucl} y2={999999} fill="var(--accent-red)" fillOpacity={0.08} />
        <ReferenceArea y1={-999999} y2={point.lcl} fill="var(--accent-red)" fillOpacity={0.08} />
        <ReferenceLine y={point.ucl} stroke="var(--accent-red)" strokeOpacity={0.4} strokeDasharray="4 4" strokeWidth={1} />
        <ReferenceLine y={point.lcl} stroke="var(--accent-red)" strokeOpacity={0.4} strokeDasharray="4 4" strokeWidth={1} />
      </>
    );

    const lineColor = isDanger ? 'var(--accent-red-light)' : isWarning ? 'var(--accent-yellow-light)' : 'var(--accent-green)';

    if (eq.visType === 'molding_matrix') {
      return (
        <LineChart {...commonProps}>
          {commonAxes}
          <Line type="stepAfter" dataKey="value" stroke={lineColor} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      );
    }

    if (eq.visType === 'four_rings') {
      return (
        <LineChart {...commonProps}>
          {commonAxes}
          <Line type="monotone" dataKey="value" stroke={lineColor} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      );
    }

    return (
      <AreaChart {...commonProps}>
        <defs>
          <linearGradient id={`grad-trend-${point.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={lineColor} stopOpacity={0.3}/>
            <stop offset="95%" stopColor={lineColor} stopOpacity={0}/>
          </linearGradient>
        </defs>
        {commonAxes}
        <Area type="monotone" dataKey="value" stroke={lineColor} fill={`url(#grad-trend-${point.id})`} strokeWidth={2} isAnimationActive={false} />
      </AreaChart>
    );
  };

  return (
    <div className={cn("glass-panel rounded-xl flex flex-col h-full w-full overflow-hidden relative group transition-all duration-300", borderColor, shadowColor)}>
      {compact && <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-[var(--bg-panel)] to-transparent z-0 pointer-events-none" />}
      <div className={cn("flex justify-between items-start shrink-0 z-10", compact ? "absolute top-0 left-0 right-0 p-2 pointer-events-none" : "relative p-4 pb-0")}>
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <div className={cn("w-2 h-2 rounded-full shadow-[0_0_5px_currentColor]", dotColor)} />
            <span className={cn("font-bold text-[var(--text-main)] tracking-wide", compact ? "text-xs drop-shadow-md" : "text-sm")}>{eq.name}</span>
            {!compact && <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 border border-[var(--border-base)] px-1 rounded bg-[var(--border-base)]/50">{eq.deviceId}</span>}
          </div>
          {!compact && <span className="text-[10px] text-[var(--text-muted)] tracking-widest uppercase ml-4">{point.type === 'temperature' ? 'MOLD TEMP' : point.type === 'pressure' ? 'CURRENT' : point.type}</span>}
          <div className={cn("flex items-baseline gap-1 ml-4", compact ? "mt-0" : "mt-1")}>
            <span className={cn("font-bold font-mono tracking-tighter text-glow", textColor, compact ? "text-2xl drop-shadow-md" : "text-4xl")}>
              {isOffline ? '—' : point.value.toFixed(1)}
            </span>
            {!compact && !isOffline && <span className="text-xs text-[var(--text-muted)]">{point.unit}</span>}
            {!compact && isOffline && <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest ml-1">offline</span>}
          </div>
        </div>

        <div className="flex flex-col items-end">
          <span className={cn("text-[var(--text-muted)]", compact ? "text-[9px] drop-shadow-md" : "text-[10px] mb-1")}>{point.name}</span>
          {isEditing ? (
            <div className={cn("flex flex-col items-end glass-card rounded border border-[var(--border-trend)] pointer-events-auto", compact ? "mt-1 p-1 gap-0.5" : "mt-2 p-2 gap-1")}>
              <div className="flex items-center gap-1">
                <span className={cn("text-[var(--text-muted)]", compact ? "text-[8px]" : "text-[10px]")}>UCL:</span>
                <input type="number" value={editUcl} onChange={e => setEditUcl(e.target.value)}
                  className={cn("bg-transparent border-b border-[var(--accent-blue)] text-[var(--text-main)] outline-none text-right", compact ? "w-8 text-[9px]" : "w-12 text-xs")} />
              </div>
              <div className="flex items-center gap-1">
                <span className={cn("text-[var(--text-muted)]", compact ? "text-[8px]" : "text-[10px]")}>LCL:</span>
                <input type="number" value={editLcl} onChange={e => setEditLcl(e.target.value)}
                  className={cn("bg-transparent border-b border-[var(--accent-blue)] text-[var(--text-main)] outline-none text-right", compact ? "w-8 text-[9px]" : "w-12 text-xs")} />
              </div>
              <div className="flex gap-2 mt-1">
                <button onClick={() => setIsEditing(false)} className={cn("text-[var(--text-muted)] hover:text-[var(--text-main)]", compact ? "text-[8px]" : "text-[10px]")}>Cancel</button>
                <button onClick={handleSave} className={cn("text-[var(--accent-green)] hover:text-[var(--accent-green-light)]", compact ? "text-[8px]" : "text-[10px]")}>Save</button>
              </div>
            </div>
          ) : (
            <div
              className={cn("flex flex-col items-end cursor-pointer hover:bg-[var(--border-trend)]/50 rounded transition-colors", compact ? "mt-0 p-0 pointer-events-auto" : "mt-2 p-1")}
              onClick={() => setIsEditing(true)}
              title="Click to edit limits"
            >
              <div className={cn("flex items-center", compact ? "gap-0.5" : "gap-1")}>
                <span className={cn("text-[var(--text-muted)]", compact ? "text-[8px] drop-shadow-md" : "text-[10px]")}>UCL:</span>
                <span className={cn("font-mono text-[var(--accent-red)] opacity-80 font-bold", compact ? "text-[9px] drop-shadow-md" : "text-xs")}>{point.ucl}</span>
              </div>
              <div className={cn("flex items-center", compact ? "gap-0.5" : "gap-1")}>
                <span className={cn("text-[var(--text-muted)]", compact ? "text-[8px] drop-shadow-md" : "text-[10px]")}>LCL:</span>
                <span className={cn("font-mono text-[var(--accent-red)] opacity-80 font-bold", compact ? "text-[9px] drop-shadow-md" : "text-xs")}>{point.lcl}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={cn("flex-1 min-h-[80px] relative z-0", compact ? "mt-0" : "mt-2")}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  );
});

import React from 'react';
import type { Point } from '../../types';
import { getStatusColor } from '../../constants/templates';
import { AnimatedValue } from './AnimatedValue';
import { usePointDrag } from '../../hooks/usePointDrag';
import { cn } from '../../utils/cn';

interface GaugeCellProps {
  point: Point;
  index?: number;
  onPointSwap?: (dragIndex: number, dropIndex: number) => void;
  dragScope?: string;
}

/**
 * Horizontal segmented gauge — shows where `point.value` sits inside the
 * `[lcl, ucl]` band, with overflow indicators when it leaves either side.
 *
 * Visual rhythm:
 *   [name              ]
 *   [BIG VALUE   unit ]
 *   [▭▭▭▭▭●▭▭▭▭▭]
 *    LCL          UCL
 */
const GaugeCell = React.memo(function GaugeCell({ point, index, onPointSwap, dragScope }: GaugeCellProps) {
  const hasLimits = point.ucl > 0 && point.ucl > point.lcl;
  const statusColor = getStatusColor(point.status);

  // Position 0..1 along the [lcl, ucl] axis (clamped, with overflow flags).
  const range = point.ucl - point.lcl;
  const rawPosition = hasLimits ? (point.value - point.lcl) / range : 0.5;
  const position = Math.max(0, Math.min(1, rawPosition));
  const below = hasLimits && rawPosition < 0;
  const above = hasLimits && rawPosition > 1;

  const dragProps = onPointSwap && index !== undefined
    ? usePointDrag({ index, onPointSwap, dragScope })
    : { draggable: false as const };

  // Status tint for the gauge fill: subtle green at normal, vivid red at danger.
  const trackFillColor = point.status === 'normal'
    ? 'var(--accent-green)'
    : statusColor;

  return (
    <div
      className="flex flex-col w-full h-full min-h-[88px] gap-1.5 px-2 py-2 rounded-lg bg-[var(--bg-surface,transparent)] hover:bg-[var(--border-base)]/30 transition-colors"
      {...dragProps}
    >
      {/* Top row: name (left) + value (right). Tightly grouped. */}
      <div className="flex items-baseline justify-between gap-2 min-w-0">
        <span className="text-[10px] md:text-[11px] text-[var(--text-muted)] tracking-wide truncate" title={point.name}>
          {point.name}
        </span>
        <span className="flex items-baseline gap-0.5 shrink-0">
          <AnimatedValue
            value={point.value}
            status={point.status}
            className="text-xl md:text-2xl font-bold tabular-nums tracking-tight leading-none"
          />
          <span className="text-[9px] text-[var(--text-muted)] font-mono leading-none">{point.unit}</span>
        </span>
      </div>

      {/* Gauge track */}
      <div className="relative flex-1 flex items-end min-h-[28px]">
        {hasLimits ? (
          <div className="relative w-full h-2 rounded-full bg-[var(--border-base)]/60 overflow-visible">
            {/* Filled range from LCL up to current position */}
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${position * 100}%`,
                background: `linear-gradient(90deg, ${trackFillColor}55 0%, ${trackFillColor} 100%)`,
              }}
            />
            {/* Tick at LCL */}
            <div className="absolute -bottom-1 left-0 w-px h-3 bg-[var(--text-muted)]/40" />
            {/* Tick at UCL */}
            <div className="absolute -bottom-1 right-0 w-px h-3 bg-[var(--text-muted)]/40" />
            {/* Current value marker */}
            <div
              className="absolute -top-1 -translate-x-1/2 w-3 h-4 rounded-sm shadow-[0_0_8px_currentColor] transition-all duration-500 ease-out"
              style={{
                left: `${position * 100}%`,
                color: statusColor,
                backgroundColor: statusColor,
              }}
            />
            {/* Overflow arrow indicators */}
            {below && (
              <div className="absolute -left-3 top-1/2 -translate-y-1/2 text-[var(--accent-red)] text-[10px] font-bold animate-pulse">◂</div>
            )}
            {above && (
              <div className="absolute -right-3 top-1/2 -translate-y-1/2 text-[var(--accent-red)] text-[10px] font-bold animate-pulse">▸</div>
            )}
          </div>
        ) : (
          // No limits set: subtle dashed placeholder so the layout doesn't shift
          <div className="w-full h-2 rounded-full border border-dashed border-[var(--border-base)]/50" />
        )}
      </div>

      {/* LCL / UCL labels */}
      {hasLimits && (
        <div className="flex justify-between text-[8px] md:text-[9px] font-mono text-[var(--text-muted)]/70 leading-none">
          <span>{point.lcl.toFixed(0)}</span>
          <span>{point.ucl.toFixed(0)}</span>
        </div>
      )}
    </div>
  );
});

interface FourRingsProps {
  points: Point[];
  onPointSwap?: (dragIndex: number, dropIndex: number) => void;
  dragScope?: string;
}

/**
 * 4-point tile — horizontal gauges in a 2x2 grid.
 *
 * Replaced the original 4 circular ring gauges (visually busy, UCL/LCL
 * markers were 7px and unreadable) with linear segmented gauges that
 * make the value's position inside the [LCL, UCL] band physically obvious.
 *
 * Name kept (`FourRings` / `four_rings` visType) for backwards compat
 * with existing EquipmentType records in DB.
 */
export const FourRings = React.memo(function FourRings({ points, onPointSwap, dragScope }: FourRingsProps) {
  const slice = points.slice(0, 4);

  return (
    <div className={cn(
      'grid h-full w-full content-stretch gap-2 md:gap-3 p-1.5',
      slice.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
    )}>
      {slice.map((p, i) => (
        <GaugeCell key={p.id} point={p} index={i} onPointSwap={onPointSwap} dragScope={dragScope} />
      ))}
    </div>
  );
});
